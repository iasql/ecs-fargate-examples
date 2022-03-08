# Quickstart

This [template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) follows this IaSQL [tutorial](https://docs.iasql.com/quickstart/) to deploy a Node.js HTTP server within a docker container on your AWS account using ECS, ECR and ELB. The container image will be hosted as a public repository in ECR and deployed to ECS using Fargate.


## Migrations

To add a migration to infra as a SQL db run:

```bash
npm i
npx typeorm migration:create --outputJs -n <YourMigrationName>
```

This will create a `infra/src/migration/YourMigrationName.ts`. To read more about TypeORM migrations: https://typeorm.io/#/migrations.