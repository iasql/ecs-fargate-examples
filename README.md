# Quickstart

Template to help you deploy an HTTP server via IaSQL to your AWS account using the following cloud services: ECS, ECR and ELB.

## Pre-requisites

  - An IaSQL DB with modules `aws_cloudwatch`, `aws_ecr`, `aws_ecs`, `aws_elb` and `aws_security_group` installed.
  - `psql` installed.
  
## Usage

  1. Execute the sql script with the following command:
  ```sh
  PGPASSWORD='<db password>' psql -h db.iasql.com -p 5432 -U <username> -d <db-name>  -v project_name="'<project-name>'" -f <path>/<to>/quickstart.sql
  ```

  2. Apply iasql changes
  ```sh
  iasql apply
  ```
  
  3. Grab your new ECR URI from your DB 
  ```sql
  select repository_uri
  from aws_public_repository
  where repository_name = '<project-name>-repository'
  ```
  or
  ```sh
  PGPASSWORD='<db password>' psql -h db.iasql.com -p 5432 -U <username> -d <db-name> -c "select repository_uri from aws_public_repository where repository_name = '<project-name>-repository';"
  ```

  4. Login, build and push your code to the container registry

  - Login:
  
  ```sh
  aws ecr-public get-login-password --region us-east-1 --profile <profile> | docker login --username AWS --password-stdin <ECR URI>
  ```

  - Build your image

  ```sh
  docker build -t <repository-name> <path to Dockerfile>
  ```

  - Tag your image

  ```sh
  docker tag <repository-name>:latest <ECR URI>:latest
  ```

  - Push your image

  ```sh
  docker push <ECR URI>:latest
  ```
  
  5. Grab your load balancer DNS
  ```sql
  select dns_name
  from aws_load_balancer
  where load_balancer_name = '<project-name>-load-balancer'
  ```
  or
  ```sh
  PGPASSWORD='<db password>' psql -h db.iasql.com -p 5432 -U <username> -d <db-name> -c "select dns_name from aws_load_balancer where load_balancer_name = '<project-name>-load-balancer';"
  ```

  6. Connect to your service!
  ```sh
  curl <dns-name>:8088/health
  ```
