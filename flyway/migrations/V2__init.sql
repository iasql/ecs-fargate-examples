-- we use transactions to make sure we don't leave cruft behind in case an insert fails
-- make sure the correct iasql modules are installed or the tables won't exist
-- this will be easier once we have https://github.com/iasql/iasql-engine/issues/468

-- AWS SECURITY GROUPS
BEGIN;
  INSERT INTO security_group (description, group_name)
  VALUES ('${projectName} security group', '${projectName}-security-group');

  INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
  SELECT false, 'tcp', ${port}, ${port}, '0.0.0.0/0', '${projectName}-security-group', id
  FROM security_group
  WHERE group_name = '${projectName}-security-group';

  INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
  SELECT true, '-1', -1, -1, '0.0.0.0/0', '${projectName}-security-group', id
  FROM security_group
  WHERE group_name = '${projectName}-security-group';
COMMIT;

-- AWS ELASTIC LOAD BALANCER
BEGIN;
  INSERT INTO target_group
      (target_group_name, target_type, protocol, port, vpc, health_check_path)
  VALUES
      ('${projectName}-target', 'ip', 'HTTP', ${port}, 'default', '/health');

  INSERT INTO load_balancer
      (load_balancer_name, scheme, vpc, load_balancer_type, ip_address_type)
  VALUES
      ('${projectName}-load-balancer', 'internet-facing', 'default', 'application', 'ipv4');

  INSERT INTO load_balancer_security_groups
      (load_balancer_id, security_group_id)
  VALUES
      ((SELECT id FROM load_balancer WHERE load_balancer_name = '${projectName}-load-balancer' LIMIT 1),
        (SELECT id FROM security_group WHERE group_name = '${projectName}-security-group' LIMIT 1));

  INSERT INTO listener
      (load_balancer_id, port, protocol, action_type, target_group_id)
  VALUES
      ((SELECT id FROM load_balancer WHERE load_balancer_name = '${projectName}-load-balancer' LIMIT 1),
        ${port}, 'HTTP', 'forward', (SELECT id FROM target_group WHERE target_group_name = '${projectName}-target' LIMIT 1));
COMMIT;

-- AWS ELASTIC CONTAINER REPOSITORY (ECR)
-- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
BEGIN;
  INSERT INTO public_repository (repository_name) VALUES ('${projectName}-repository');

  INSERT INTO cluster (cluster_name) VALUES('${projectName}-cluster');

  INSERT INTO role (role_name, assume_role_policy_document, attached_policies_arns)
  VALUES ('ecsTaskExecRole', '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}', array['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy']);

  INSERT INTO task_definition ("family", task_role_name, execution_role_name, cpu_memory)
  VALUES ('${projectName}-td', 'ecsTaskExecRole', 'ecsTaskExecRole', '${taskDefResources}');

  INSERT INTO container_definition ("name", essential, public_repository_id, task_definition_id, tag, memory_reservation, host_port, container_port, protocol)
  VALUES (
    '${projectName}-container', true,
    (select id from public_repository where repository_name = '${projectName}-repository' limit 1),
    (select id from task_definition where family = '${projectName}-td' and status is null limit 1),
    '${imageTag}', ${containerMemReservation}, ${port}, ${port}, 'tcp'
  );
COMMIT;

-- create ECS service and associate it to security group
BEGIN;
  INSERT INTO service ("name", desired_count, assign_public_ip, subnets, cluster_id, task_definition_id, target_group_id)
  VALUES (
    '${projectName}-service', 1, 'ENABLED',
    (select array(select subnet_id from subnet inner join vpc on vpc.id = subnet.vpc_id where is_default = true limit 3)),
    (select id from cluster where cluster_name = '${projectName}-cluster'),
    (select id from task_definition where family = '${projectName}-td' order by revision desc limit 1),
    (select id from target_group where target_group_name = '${projectName}-target' limit 1)
  );

  INSERT INTO service_security_groups (service_id, security_group_id)
  VALUES (
    (select id from service where name = '${projectName}-service' limit 1),
    (select id from security_group where group_name = '${projectName}-security-group' limit 1)
  );
COMMIT;

-- apply these changes
SELECT * FROM iasql_apply();