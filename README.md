# ECS Fargate Examples with IaSQL on different ORMs

This [template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) houses quickstart examples of how to use IaSQL with different ORMs to deploy an HTTP server within a docker container on your AWS account using Fargate ECS, IAM, ECR and ELB. The container image will be hosted as a private repository in ECR and deployed to ECS using Fargate.

To illustrate all the different ways in which infrastructure can be managed with IaSQL, we implement the same infrastructure with IaSQL using different ORMs. Each of them points to their respective tutorial:
- [TypeORM (SQL ORM)](https://docs.iasql.com/typeorm/)
- [Flyway (SQL)](https://docs.iasql.com/flyway/)
- [Prisma (Javascript)](https://docs.iasql.com/prisma/)
- [Django (Python)](https://docs.iasql.com/django/)