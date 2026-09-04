import * as dotenv from 'dotenv'
dotenv.config()
import { platformDb } from '@platform/db'
async function main() {
  const users = await platformDb.platformUser.findMany();
  console.log(users.map(u => u.email));
}
main().finally(() => platformDb.$disconnect());
