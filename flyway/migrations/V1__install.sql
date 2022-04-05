-- make sure the correct iasql modules are installed or the tables won't exist
SELECT * FROM iasql_install(
  'aws_iam',
  'aws_vpc',
  'aws_security_group',
  'aws_elb',
  'aws_cloudwatch',
  'aws_ecr',
  'aws_ecs_fargate',
  'aws_rds'
);
