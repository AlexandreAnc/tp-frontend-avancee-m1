import { getVapidPublicKey } from '../../services/push';
import { defineAppHandler } from '../../utils/handler';

export default defineAppHandler(() => ({ publicKey: getVapidPublicKey() }));
