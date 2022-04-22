const { execSync } = require('child_process')
const { PrismaClient } = require('@prisma/client');

const pkg = require('./package.json');
const PROJECT_NAME = pkgName;

const REGION = process.env.AWS_REGION ?? '';

const prisma = new PrismaClient()

async function main() {
  const repository_uri = await prisma.repository.findFirst({
    where: { repository_name: `${PROJECT_NAME}-repository`},
    select: { repository_uri }
  });

  console.log('Docker login...')
  execSync(`aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${repository_uri}`)

  console.log('Building image...')
  execSync(`docker build -t ${PROJECT_NAME}-repository ${__dirname}/../app`);

  console.log('Tagging image...')
  execSync(`docker tag ${PROJECT_NAME}-repository:latest ${repository_uri}:latest`);

  console.log('nPushing image...')
  execSync(`docker push ${repository_uri}:latest`);

  console.log('Force new deployment')
  await prisma.service.update({
    where: { name: `${PROJECT_NAME}-service`},
    data: { force_new_deployment: true }
  });
  const apply = await prisma.$queryRaw`SELECT * from iasql_apply();`
  console.dir(apply)
}

main()
  .catch((e) => {
    throw e
  })
  .finally(async () => {
    await prisma.$disconnect()
  })