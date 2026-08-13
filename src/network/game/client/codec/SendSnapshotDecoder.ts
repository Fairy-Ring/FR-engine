import Packet from '#/io/Packet.js';
import ClientGameMessageDecoder from '#/network/game/client/ClientGameMessageDecoder.js';
import ClientGameProt from '#/network/game/client/ClientGameProt.js';
import SendSnapshot from '#/network/game/client/model/SendSnapshot.js';

export default class SendSnapshotDecoder extends ClientGameMessageDecoder<SendSnapshot> {
    prot = ClientGameProt.SEND_SNAPSHOT;

    decode(buf: Packet) {
        const offender = buf.g8();
        const reason = buf.g1();
        const moderatorMute = buf.gbool();

        return new SendSnapshot(offender, reason, moderatorMute);
    }
}
