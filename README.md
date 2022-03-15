# ecs-fargate-quickstart

This [template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) houses quickstart examples of how to use IaSQL to deploy an HTTP server within a docker container on your AWS account using ECS, Fargate ECR and ELB. The container image will be hosted as a public repository in ECR and deployed to ECS using Fargate.

## Structure

To illustrate all in the different ways in which infrastructure can be managed with IaSQL, we implement the same infrastructure with IaSQL using different ORMs. Each of them points to their respective quickstart tutorial:
- Flyway (SQL)
- TypeORM (Javascript)