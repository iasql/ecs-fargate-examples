-- we use transactions to make sure we don't leave cruft behind in case an insert fails
-- make sure the correct iasql modules are installed or the tables won't exist
-- this will be easier once we have https://github.com/iasql/iasql-engine/issues/468

-- AWS SECURITY GROUPS
BEGIN;
  INSERT INTO security_group (description, group_name)
  VALUES ('${project_name} security group', '${project_name}-security-group');

  INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
  SELECT false, 'tcp', ${port}, ${port}, '0.0.0.0/0', '${project_name}-security-group', id
  FROM security_group
  WHERE group_name = '${project_name}-security-group';

  INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
  SELECT true, '-1', -1, -1, '0.0.0.0/0', '${project_name}-security-group', id
  FROM security_group
  WHERE group_name = '${project_name}-security-group';
COMMIT;

-- AWS ELASTIC LOAD BALANCER
BEGIN;
  INSERT INTO target_group
      (target_group_name, target_type, protocol, port, vpc, health_check_path)
  VALUES
      ('${project_name}-target', 'ip', 'HTTP', ${port}, null, '/health');

  INSERT INTO load_balancer
      (load_balancer_name, scheme, vpc, load_balancer_type, ip_address_type)
  VALUES
      ('${project_name}-load-balancer', 'internet-facing', null, 'application', 'ipv4');

  INSERT INTO load_balancer_security_groups
      (load_balancer_name, security_group_id)
  VALUES
      ('${project_name}-load-balancer',
        (SELECT id FROM security_group WHERE group_name = '${project_name}-security-group' LIMIT 1)
      );

  INSERT INTO listener
      (load_balancer_name, port, protocol, action_type, target_group_name)
  VALUES
      ('${project_name}-load-balancer',
        ${port}, 'HTTP', 'forward', '${project_name}-target');
COMMIT;

-- ELASTIC CONTAINER REPOSITORY (ECR) + ELASTIC CONTAINER SERVICE (ECS) + CLOUDWATCH
-- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
BEGIN;
  INSERT INTO log_group (log_group_name) VALUES ('${project_name}-log-group');

  INSERT INTO repository (repository_name) VALUES ('${project_name}-repository');

  INSERT INTO cluster (cluster_name) VALUES('${project_name}-cluster');

  INSERT INTO role (role_name, assume_role_policy_document, attached_policies_arns)
  VALUES ('ecsTaskExecRole${region}', '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}', array['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy']);

  INSERT INTO task_definition ("family", task_role_name, execution_role_name, cpu_memory)
  VALUES ('${project_name}-td', 'ecsTaskExecRole${region}', 'ecsTaskExecRole${region}', '${task_def_resources}');

  INSERT INTO container_definition ("name", essential, repository_name, task_definition_id, tag, memory_reservation, host_port, container_port, protocol, log_group_name)
  VALUES (
    '${project_name}-container', true,
    '${project_name}-repository',
    (select id from task_definition where family = '${project_name}-td' and status is null limit 1),
    '${image_tag}', ${container_mem_reservation}, ${port}, ${port}, 'tcp', '${project_name}-log-group'
  );
COMMIT;

-- create ECS service and associate it to security group
BEGIN;
  INSERT INTO service ("name", desired_count, assign_public_ip, subnets, cluster_name, task_definition_id, target_group_name)
  VALUES (
    '${project_name}-service', 1, 'ENABLED',
    (select array(select subnet_id from subnet inner join vpc on vpc.id = subnet.vpc_id where is_default = true limit 3)),
    '${project_name}-cluster',
    (select id from task_definition where family = '${project_name}-td' order by revision desc limit 1),
    '${project_name}-target'
  );

  INSERT INTO service_security_groups (service_name, security_group_id)
  VALUES (
    '${project_name}-service',
    (select id from security_group where group_name = '${project_name}-security-group' limit 1)
  );
COMMIT;

-- apply these changes
SELECT * FROM iasql_apply();