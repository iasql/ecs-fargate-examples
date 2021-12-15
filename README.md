# Quickstart

Template to help you deploy an HTTP server via IaSQL to your AWS account using the following cloud services: ECS, ECR and ELB.

## Pre-requisites

  - You will need to have a ECS execution role. If you don't have it follow this instructions: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
  - An IaSQL DB with modules `aws_cloudwatch`, `aws_ecr`, `aws_ecs`, `aws_elb` and `aws_security_group` installed.
  - `psql` installed.
  
## Usage

  1. Update the quickstart template scritpt with the values of your preference.
  2. Execute the sql script with the following command:
  ```sh
  psql -h db.iasql.com -p 5432 -U <username> -d <db-name> -f <path>/<to>/quickstart.sql
  ```

  3. Apply iasql changes
  ```sh
  iasql apply
  ```
  
  4. Grab your new ECR URI. Could be find in your DB > `aws_ecr` table > `repository_uri` column. Also, you could find it using the AWS UI console.
  5. Login, build and push your code to the container registry

  - Login:
  
  ```sh
  aws ecr get-login-password --region <region> --profile <profile> | docker login --username AWS --password-stdin <ECR URI>
  ```

  - Build your image

  ```sh
  docker build -t <repository-name> <path to Dockerfile>
  ```

  - Tag your image

  ```sh
  docker tag <image-name>:latest <ECR URI>:latest
  ```

  - Push your image

  ```sh
  docker push <ECR URI>:latest
  ```
  
  6. Grab your load balancer DNS and access to your service!
