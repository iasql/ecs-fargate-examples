-- make sure the correct iasql modules are installed or the tables won't exist
SELECT * FROM iasql_install(
  'aws_vpc@0.0.1',
  'aws_security_group@0.0.1',
  'aws_elb@0.0.1',
  'aws_cloudwatch@0.0.1',
  'aws_ecr@0.0.1',
  'aws_ecs_fargate@0.0.1',
  'aws_rds@0.0.1'
);
