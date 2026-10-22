import { getFile, toFileDto } from '../../services/files';
import { defineAppHandler } from '../../utils/handler';
import { requireUser } from '../../utils/session';
import { getUuidParam } from '../../utils/validation';

export default defineAppHandler(async (event) => {
  const user = await requireUser(event);
  return { file: toFileDto(await getFile(user.id, getUuidParam(event))) };
});
