// src/io/ClientStream.ts
class ClientStream {
  socket;
  wsin;
  wsout;
  dummy = false;
  remoteClosed = false;
  static async openSocket(host, secured) {
    return await new Promise((resolve, reject) => {
      const protocol = secured ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${host}`, "binary");
      ws.addEventListener("open", () => {
        resolve(ws);
      });
      ws.addEventListener("error", () => {
        reject(ws);
      });
    });
  }
  constructor(socket) {
    socket.onclose = this.onclose;
    socket.onerror = this.onerror;
    this.wsin = new WebSocketReader(socket, 30000);
    this.wsout = new WebSocketWriter(socket, 5000);
    this.socket = socket;
  }
  get host() {
    return this.socket.url.split("/")[2];
  }
  get port() {
    return parseInt(this.socket.url.split(":")[2], 10);
  }
  get available() {
    if (this.dummy) {
      return 0;
    }
    return this.wsin.available;
  }
  write(src, len) {
    if (this.dummy) {
      return;
    }
    this.wsout.write(src, len);
  }
  async read() {
    if (this.dummy) {
      return 0;
    }
    if (this.remoteClosed && this.wsin.available === 0) {
      return -1;
    }
    try {
      return await this.wsin.read();
    } catch (err) {
      if (this.remoteClosed && this.wsin.available === 0) {
        return -1;
      }
      throw err;
    }
  }
  async readBytes(dst, off, len) {
    if (this.dummy) {
      return;
    }
    await this.wsin.readBytes(dst, off, len);
  }
  close() {
    if (this.dummy) {
      return;
    }
    this.dummy = true;
    this.socket.close();
    this.wsin.close();
    this.wsout.close();
  }
  onclose = (_event) => {
    if (this.dummy) {
      return;
    }
    this.remoteClose();
  };
  onerror = (_event) => {
    if (this.dummy) {
      return;
    }
    this.remoteClose();
  };
  remoteClose() {
    this.remoteClosed = true;
    this.wsin.fail();
    this.wsout.fail();
  }
}

class WebSocketWriter {
  socket;
  limit;
  closed = false;
  ioerror = false;
  constructor(socket, limit) {
    this.socket = socket;
    this.limit = limit;
  }
  write(src, len) {
    if (this.closed) {
      return;
    }
    if (this.ioerror) {
      this.ioerror = false;
      throw this.socket;
    }
    if (len >= this.limit - 100 || this.socket.bufferedAmount + len >= this.limit - 100) {
      throw this.socket;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.ioerror = true;
      return;
    }
    try {
      this.socket.send(src.slice(0, len));
    } catch (_e) {
      this.ioerror = true;
    }
  }
  close() {
    this.closed = true;
  }
  fail() {
    this.ioerror = true;
  }
}

class WebSocketEvent {
  bytes;
  position;
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }
  get available() {
    return this.bytes.length - this.position;
  }
  get read() {
    return this.bytes[this.position++];
  }
  get len() {
    return this.bytes.length;
  }
  readBytes(dst, off, len) {
    const count = Math.min(len, this.available);
    dst.set(this.bytes.subarray(this.position, this.position + count), off);
    this.position += count;
    return count;
  }
}

class WebSocketReader {
  timeoutMs;
  queue = [];
  queueRead = 0;
  event = null;
  callback = null;
  timeout = null;
  rejectRead = null;
  closed = false;
  total = 0;
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    socket.binaryType = "arraybuffer";
    socket.onmessage = this.onmessage;
  }
  socket;
  get available() {
    return this.total;
  }
  onmessage = (e) => {
    if (this.closed) {
      return;
    }
    const event = new WebSocketEvent(new Uint8Array(e.data));
    this.total += event.available;
    if (this.callback) {
      const cb = this.callback;
      this.callback = null;
      cb(event);
    } else {
      this.queue.push(event);
    }
  };
  async read() {
    let event = this.nextEvent();
    if (!event) {
      if (this.closed) {
        throw this.socket;
      }
      event = await this.waitForEvent();
    }
    this.total--;
    return event.read;
  }
  async readBytes(dst, off, len) {
    let remaining = len;
    let dstPos = off;
    while (remaining > 0) {
      let event = this.nextEvent();
      if (!event) {
        if (this.closed) {
          throw this.socket;
        }
        event = await this.waitForEvent();
      }
      const count = event.readBytes(dst, dstPos, remaining);
      this.total -= count;
      dstPos += count;
      remaining -= count;
    }
    return dst;
  }
  close() {
    this.closed = true;
    this.callback = null;
    this.clearTimeout();
    this.rejectRead?.();
    this.rejectRead = null;
    this.event = null;
    this.queue = [];
    this.queueRead = 0;
  }
  fail() {
    this.closed = true;
    this.callback = null;
    this.clearTimeout();
    this.rejectRead?.();
    this.rejectRead = null;
  }
  nextEvent() {
    if (this.event && this.event.available > 0) {
      return this.event;
    }
    this.event = null;
    while (this.queueRead < this.queue.length) {
      const event = this.queue[this.queueRead++];
      if (event.available > 0) {
        this.event = event;
        this.compactQueue();
        return event;
      }
    }
    this.compactQueue();
    return null;
  }
  compactQueue() {
    if (this.queueRead > 32 && this.queueRead * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.queueRead);
      this.queueRead = 0;
    } else if (this.queueRead === this.queue.length) {
      this.queue = [];
      this.queueRead = 0;
    }
  }
  async waitForEvent() {
    if (this.callback) {
      throw new Error;
    }
    return await new Promise((resolve, reject) => {
      this.rejectRead = () => {
        this.callback = null;
        this.clearTimeout();
        reject(this.socket);
      };
      this.timeout = setTimeout(() => {
        this.callback = null;
        this.timeout = null;
        this.rejectRead = null;
        reject(this.socket);
      }, this.timeoutMs);
      this.callback = (event) => {
        this.clearTimeout();
        this.rejectRead = null;
        this.event = event;
        resolve(event);
      };
    });
  }
  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// src/io/OnDemandWorker.ts
var worker = self;
var CRC32_POLYNOMIAL = 3988292384;
var crctable = new Int32Array(256);
for (let i = 0;i < 256; i++) {
  let remainder = i;
  for (let bit = 0;bit < 8; bit++) {
    if ((remainder & 1) === 1) {
      remainder = remainder >>> 1 ^ CRC32_POLYNOMIAL;
    } else {
      remainder >>>= 1;
    }
  }
  crctable[i] = remainder;
}
function getcrc(src, offset, length) {
  let crc = 4294967295;
  for (let i = offset;i < length; i++) {
    crc = crc >>> 8 ^ crctable[(crc ^ src[i]) & 255];
  }
  return ~crc;
}
function asUint8Array(src) {
  if (src instanceof Uint8Array) {
    return src;
  }
  return src instanceof Int8Array ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength) : new Uint8Array(src);
}
async function openDatabase() {
  return await new Promise((resolve) => {
    const request = indexedDB.open("lostcity", 1);
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      request.result.createObjectStore("cache");
    };
    request.onerror = () => {
      resolve(null);
    };
  });
}
async function read(db, archive, file) {
  return await new Promise((resolve) => {
    const transaction = db.transaction("cache", "readonly");
    const store = transaction.objectStore("cache");
    const request = store.get(`${archive}.${file}`);
    request.onsuccess = () => {
      resolve(request.result ? asUint8Array(request.result) : undefined);
    };
    request.onerror = () => {
      resolve(undefined);
    };
  });
}
async function write(db, archive, file, src) {
  if (src === null) {
    return;
  }
  await new Promise((resolve) => {
    const transaction = db.transaction("cache", "readwrite");
    const store = transaction.objectStore("cache");
    const request = store.put(src, `${archive}.${file}`);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      resolve();
    };
  });
}

class WorkerOnDemand {
  versions;
  crcs;
  priorities;
  topPriority = 0;
  running = true;
  active = false;
  ingame;
  db = null;
  host;
  secured;
  failCount = 0;
  urgentCount = 0;
  requestCount = 0;
  queue = [];
  missing = [];
  pending = [];
  prefetches = [];
  message = "";
  buf = new Uint8Array(500);
  loadedPrefetchFiles = 0;
  totalPrefetchFiles = 0;
  partOffset = 0;
  partAvailable = 0;
  packetCycle = 0;
  noTimeoutCycle = 0;
  cycle = 0;
  socketOpenTime = -4000;
  current = null;
  stream = null;
  loopTimer = null;
  loopBusy = false;
  dbReady;
  constructor(message) {
    this.versions = message.versions;
    this.crcs = message.crcs;
    this.priorities = message.versions.map((versions) => new Array(versions.length).fill(0));
    this.host = message.host;
    this.secured = message.secured;
    this.ingame = message.ingame;
    if (message.dbEnabled) {
      this.dbReady = openDatabase().then((db) => {
        this.db = db;
      });
    } else {
      this.dbReady = Promise.resolve();
    }
    this.schedule();
  }
  stop() {
    this.running = false;
    this.stream?.close();
    this.stream = null;
    this.db?.close();
    this.db = null;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }
  request(archive, file) {
    if (!this.validFile(archive, file)) {
      return;
    }
    const req = {
      archive,
      file,
      data: null,
      cycle: 0,
      urgent: true
    };
    this.queue.push(req);
  }
  async prefetchPriority(archive, file, priority) {
    await this.dbReady;
    if (!this.db || !this.validFile(archive, file)) {
      return;
    }
    const data = await read(this.db, archive + 1, file);
    if (this.validate(data, this.crcs[archive][file], this.versions[archive][file])) {
      return;
    }
    this.priorities[archive][file] = priority;
    if (priority > this.topPriority) {
      this.topPriority = priority;
    }
    this.totalPrefetchFiles++;
  }
  async prefetch(archive, file) {
    await this.dbReady;
    if (!this.db || !this.validFile(archive, file) || this.priorities[archive][file] === 0 || this.topPriority === 0) {
      return;
    }
    this.prefetches.push({
      archive,
      file,
      data: null,
      cycle: 0,
      urgent: false
    });
  }
  schedule() {
    if (!this.running) {
      return;
    }
    const delay = this.topPriority === 0 && this.db ? 50 : 20;
    this.loopTimer = setTimeout(() => this.tick(), delay);
  }
  tick() {
    if (this.loopBusy) {
      this.schedule();
      return;
    }
    this.loopBusy = true;
    this.run().catch((e) => {
      worker.postMessage({ type: "error", error: e instanceof Error ? e.message : String(e) });
    }).finally(() => {
      this.loopBusy = false;
      this.schedule();
    });
  }
  async run() {
    if (!this.running) {
      return;
    }
    await this.dbReady;
    this.cycle++;
    this.active = true;
    for (let i = 0;i < 100 && this.active; i++) {
      this.active = false;
      await this.handleQueue();
      await this.handlePending();
      if (this.urgentCount === 0 && i >= 5) {
        break;
      }
      await this.handleExtra();
      if (this.stream) {
        await this.read();
      }
    }
    let loading = false;
    for (const req of this.pending) {
      if (req.urgent) {
        loading = true;
        req.cycle++;
        if (req.cycle > 50) {
          req.cycle = 0;
          await this.send(req);
        }
      }
    }
    if (!loading) {
      for (const req of this.pending) {
        loading = true;
        req.cycle++;
        if (req.cycle > 50) {
          req.cycle = 0;
          await this.send(req);
        }
      }
    }
    if (loading) {
      this.packetCycle++;
      if (this.packetCycle > 750) {
        this.stream?.close();
        this.stream = null;
        this.partAvailable = 0;
      }
    } else {
      this.packetCycle = 0;
      this.setMessage("");
    }
    if (this.ingame && this.stream && (this.topPriority > 0 || !this.db)) {
      this.noTimeoutCycle++;
      if (this.noTimeoutCycle > 500) {
        this.noTimeoutCycle = 0;
        this.buf[0] = 0;
        this.buf[1] = 0;
        this.buf[2] = 0;
        this.buf[3] = 10;
        try {
          this.stream.write(this.buf, 4);
        } catch (_e) {
          this.packetCycle = 5000;
        }
      }
    }
  }
  async handleQueue() {
    let req = this.queue.shift();
    while (req) {
      this.active = true;
      let data;
      if (this.db) {
        data = await read(this.db, req.archive + 1, req.file);
      }
      if (!this.validate(data, this.crcs[req.archive][req.file], this.versions[req.archive][req.file])) {
        data = undefined;
      }
      if (!data) {
        this.missing.push(req);
      } else {
        req.data = data;
        this.complete(req);
      }
      req = this.queue.shift();
    }
  }
  async handlePending() {
    this.urgentCount = 0;
    this.requestCount = 0;
    for (const req of this.pending) {
      if (req.urgent) {
        this.urgentCount++;
      } else {
        this.requestCount++;
      }
    }
    while (this.urgentCount < 10) {
      const req = this.missing.shift();
      if (!req) {
        break;
      }
      if (this.priorities[req.archive][req.file] !== 0) {
        this.loadedPrefetchFiles++;
      }
      this.priorities[req.archive][req.file] = 0;
      this.pending.push(req);
      this.urgentCount++;
      await this.send(req);
      this.active = true;
    }
  }
  async handleExtra() {
    while (this.urgentCount === 0) {
      if (this.requestCount >= 10 || this.topPriority === 0) {
        return;
      }
      let extra = this.prefetches.shift();
      while (extra) {
        if (this.priorities[extra.archive][extra.file] !== 0) {
          this.priorities[extra.archive][extra.file] = 0;
          this.pending.push(extra);
          await this.send(extra);
          this.active = true;
          if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
            this.loadedPrefetchFiles++;
          }
          this.setMessage("Loading extra files - " + (this.loadedPrefetchFiles * 100 / this.totalPrefetchFiles | 0) + "%");
          this.requestCount++;
          if (this.requestCount === 10) {
            return;
          }
        }
        extra = this.prefetches.shift();
      }
      for (let archive = 0;archive < 4; archive++) {
        const priorities = this.priorities[archive];
        const count = priorities.length;
        for (let file = 0;file < count; file++) {
          if (priorities[file] === this.topPriority) {
            priorities[file] = 0;
            const req = {
              archive,
              file,
              data: null,
              cycle: 0,
              urgent: false
            };
            this.pending.push(req);
            await this.send(req);
            this.active = true;
            if (this.loadedPrefetchFiles < this.totalPrefetchFiles) {
              this.loadedPrefetchFiles++;
            }
            this.setMessage("Loading extra files - " + (this.loadedPrefetchFiles * 100 / this.totalPrefetchFiles | 0) + "%");
            this.requestCount++;
            if (this.requestCount === 10) {
              return;
            }
          }
        }
      }
      this.topPriority--;
    }
  }
  async read() {
    if (!this.stream) {
      return;
    }
    try {
      const available = this.stream.available;
      if (this.partAvailable === 0 && available >= 6) {
        this.active = true;
        await this.stream.readBytes(this.buf, 0, 6);
        const archive = this.buf[0] & 255;
        const file = ((this.buf[1] & 255) << 8) + (this.buf[2] & 255);
        const size = ((this.buf[3] & 255) << 8) + (this.buf[4] & 255);
        const part = this.buf[5] & 255;
        this.current = null;
        let matched = false;
        for (const req of this.pending) {
          if (req.archive === archive && req.file === file) {
            this.current = req;
            matched = true;
          }
          if (matched) {
            req.cycle = 0;
          }
        }
        if (this.current) {
          this.packetCycle = 0;
          if (size === 0) {
            this.current.data = null;
            if (this.current.urgent) {
              this.postCompleted(this.current);
            }
            this.removePending(this.current);
            this.current = null;
          } else {
            if (this.current.data === null && part === 0) {
              this.current.data = new Uint8Array(size);
            }
            if (this.current.data === null && part !== 0) {
              throw new Error("missing start of file");
            }
          }
        }
        this.partOffset = part * 500;
        this.partAvailable = 500;
        if (this.partAvailable > size - part * 500) {
          this.partAvailable = size - part * 500;
        }
      }
      if (this.partAvailable > 0 && available >= this.partAvailable) {
        this.active = true;
        let dst = this.buf;
        let off = 0;
        if (this.current && this.current.data) {
          dst = this.current.data;
          off = this.partOffset;
        }
        await this.stream.readBytes(dst, off, this.partAvailable);
        if (this.partAvailable + this.partOffset >= dst.length && this.current) {
          if (this.db) {
            await write(this.db, this.current.archive + 1, this.current.file, dst);
          }
          this.complete(this.current);
        }
        this.partAvailable = 0;
      }
    } catch (_e) {
      this.stream?.close();
      this.stream = null;
      this.partAvailable = 0;
    }
  }
  validate(src, expectedCrc, expectedVersion) {
    if (typeof src === "undefined" || src.length < 2) {
      return false;
    }
    const versionPos = src.length - 2;
    const version = ((src[versionPos] & 255) << 8) + (src[versionPos + 1] & 255);
    const crc = getcrc(src, 0, versionPos);
    if (version === expectedVersion) {
      return crc === expectedCrc;
    }
    return false;
  }
  async send(req) {
    try {
      if (this.stream === null) {
        const now = performance.now();
        if (now - this.socketOpenTime < 4000) {
          return;
        }
        this.socketOpenTime = now;
        this.stream = new ClientStream(await ClientStream.openSocket(this.host, this.secured));
        this.buf[0] = 15;
        this.stream.write(this.buf, 1);
        for (let i = 0;i < 8; i++) {
          await this.stream.read();
        }
        this.packetCycle = 0;
      }
      this.buf[0] = req.archive;
      this.buf[1] = req.file >> 8;
      this.buf[2] = req.file;
      if (req.urgent) {
        this.buf[3] = 2;
      } else if (this.ingame) {
        this.buf[3] = 0;
      } else {
        this.buf[3] = 1;
      }
      this.stream.write(this.buf, 4);
      this.noTimeoutCycle = 0;
      this.setFailCount(-1e4);
    } catch (_e) {
      this.stream?.close();
      this.stream = null;
      this.partAvailable = 0;
      this.setFailCount(this.failCount + 1);
    }
  }
  complete(req) {
    this.removePending(req);
    if (!req.urgent && req.archive === 3) {
      req.urgent = true;
      req.archive = 93;
    }
    if (req.urgent) {
      this.postCompleted(req);
    }
  }
  postCompleted(req) {
    if (req.data === null) {
      worker.postMessage({
        type: "completed",
        archive: req.archive,
        file: req.file,
        urgent: req.urgent,
        data: null
      });
      return;
    }
    const data = req.data.byteOffset === 0 && req.data.byteLength === req.data.buffer.byteLength && req.data.buffer instanceof ArrayBuffer ? req.data : req.data.slice();
    const buffer = data.buffer;
    worker.postMessage({
      type: "completed",
      archive: req.archive,
      file: req.file,
      urgent: req.urgent,
      data: buffer
    }, [buffer]);
  }
  removePending(req) {
    const index = this.pending.indexOf(req);
    if (index !== -1) {
      this.pending.splice(index, 1);
    }
  }
  validFile(archive, file) {
    return archive >= 0 && archive < this.versions.length && file >= 0 && file < this.versions[archive].length && this.versions[archive][file] !== 0;
  }
  setMessage(message) {
    if (this.message === message) {
      return;
    }
    this.message = message;
    worker.postMessage({ type: "message", message });
  }
  setFailCount(failCount) {
    if (this.failCount === failCount) {
      return;
    }
    this.failCount = failCount;
    worker.postMessage({ type: "failCount", failCount });
  }
}
var onDemand = null;
var messageQueue = Promise.resolve();
worker.addEventListener("message", (event) => {
  messageQueue = messageQueue.then(() => handleMessage(event.data)).catch((e) => {
    worker.postMessage({ type: "error", error: e instanceof Error ? e.message : String(e) });
  });
});
async function handleMessage(message) {
  if (message.type === "init") {
    onDemand?.stop();
    onDemand = new WorkerOnDemand(message);
  } else if (message.type === "stop") {
    onDemand?.stop();
    onDemand = null;
  } else if (message.type === "setIngame") {
    if (onDemand) {
      onDemand.ingame = message.ingame;
    }
  } else if (message.type === "request") {
    onDemand?.request(message.archive, message.file);
  } else if (message.type === "prefetchPriority") {
    try {
      await onDemand?.prefetchPriority(message.archive, message.file, message.priority);
    } finally {
      if (typeof message.id === "number") {
        worker.postMessage({ type: "ack", id: message.id });
      }
    }
  } else if (message.type === "prefetch") {
    await onDemand?.prefetch(message.archive, message.file);
  } else if (message.type === "clearPrefetches") {
    if (onDemand) {
      onDemand.prefetches = [];
    }
  }
}

//# debugId=A258CD12A9102B8E64756E2164756E21
