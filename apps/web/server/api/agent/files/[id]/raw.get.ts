import { sendStream, setResponseHeaders } from 'h3';
import { openFileForAgent } from '../../../../services/files';
import { defineAppHandler } from '../../../../utils/handler';
import { requireTaskToken } from '../../../../utils/task-auth';
import { getUuidParam } from '../../../../utils/validation';

export default defineAppHandler(async (event) => {
  const { userId } = await requireTaskToken(event);
  const { file, stream } = await openFileForAgent(userId, getUuidParam(event));
  setResponseHeaders(event, {
    'content-type': file.mimeType,
    'content-length': file.sizeBytes,
    'cache-control': 'no-store',
  });
  return sendStream(event, stream);
});
