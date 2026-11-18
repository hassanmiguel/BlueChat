import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoPatterns = /(^|[^a-z])(demo|test|testing|sample|fake|example|alice|bob|charlie|admin|moderator|guest|blueadmin|spamuser|devmaster)([^a-z]|$)/i;

const isDemoAccount = (user: { username: string; email: string }) =>
  demoPatterns.test(user.username) || demoPatterns.test(user.email);

const main = async () => {
  const purgeAll = process.argv.includes('--all');
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true },
  });
  const targets = purgeAll ? users : users.filter(isDemoAccount);

  if (!targets.length) {
    console.log('No demo accounts found.');
    return;
  }

  console.log(`Deleting ${targets.length} account(s):`);
  for (const user of targets) console.log(`  - ${user.username} (${user.email})`);

  await prisma.user.deleteMany({ where: { id: { in: targets.map((u) => u.id) } } });
  console.log('Done.');
};

main()
  .catch((error) => {
    console.error('Purge failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
