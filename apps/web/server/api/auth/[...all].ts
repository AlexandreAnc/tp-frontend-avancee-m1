import { defineEventHandler, toWebRequest } from 'h3';
import { getAuth } from '../../utils/auth';

export default defineEventHandler((event) => getAuth().handler(toWebRequest(event)));
