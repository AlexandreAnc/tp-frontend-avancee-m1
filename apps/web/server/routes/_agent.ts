import { defineWebSocketHandler } from 'h3';
import { handleClose, handleMessage, handleOpen } from '../agent-gateway/gateway';

// Point d'entrée WebSocket des agents locaux (`AGENT_WS_PATH` dans packages/shared).
export default defineWebSocketHandler({
  open(peer) {
    handleOpen(peer.id, peer);
  },
  async message(peer, message) {
    await handleMessage(peer.id, message.text());
  },
  async close(peer) {
    await handleClose(peer.id);
  },
  error(peer, error) {
    console.error(`[agent-gateway] erreur WebSocket ${peer.id}`, error);
  },
});
