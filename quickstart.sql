-- Quickstart PL/SQL template to launch an ECS fargate service.

set project.name = :project_name;
do $$
<<quickstart>>
  declare
    project_name text := current_setting('project.name');

    default_vpc text := 'default';
    target_group_health_path text := '/health';
    port integer := 8088;
    service_desired_count integer := 1;
    image_tag text := 'latest';
    container_memory_reservation integer := 8192; -- in MiB
    task_definition_resources aws_task_definition_cpu_memory_enum := '2vCPU-8GB';
    target_group text := project_name || '-target-group';
    load_balancer text := project_name || '-load-balancer';
    repository text := project_name || '-repository';
    quickstart_cluster text := project_name || '-cluster';
    container text := project_name || '-container';
    task_definition text := project_name || '-task-definition';
    ecs_task_execution_role text := null;  -- No necessary for public repositories
    security_group text := project_name || '-security-group';
    service text := project_name || '-service';
  begin
    -- Security group
    call create_or_update_aws_security_group(
      security_group, security_group,
      ('[{"isEgress": false, "ipProtocol": "tcp", "fromPort": ' || port || ', "toPort": ' || port || ', "cidrIpv4": "0.0.0.0/0"}, {"isEgress": true, "ipProtocol": -1, "fromPort": -1, "toPort": -1, "cidrIpv4": "0.0.0.0/0"}]')::jsonb
    );

    -- Target group
    call create_or_update_aws_target_group(
      target_group, 'ip', port, default_vpc, 'HTTP', target_group_health_path
    );

    -- Load balancer
    call create_or_update_aws_load_balancer(
      load_balancer, 'internet-facing', default_vpc, 'application', 'ipv4', array[security_group]
    );

    -- Load balancer listener
    call create_or_update_aws_listener(load_balancer, port, 'HTTP', 'forward', target_group);

    -- ECR repository
    call create_or_update_ecr_public_repository(repository);

    -- ECS Cluster
    call create_or_update_ecs_cluster(quickstart_cluster);

    -- ECS Task definition
    call create_task_definition(
      task_definition, ecs_task_execution_role, ecs_task_execution_role, task_definition_resources
    );

    -- Container definition for task definition created
    call create_container_definition(
      container, task_definition, true, container_memory_reservation, port, port, 'tcp',
      ('{"PORT": ' || port || '}')::json, image_tag,
      _ecr_public_repository_name := repository
    );

    -- ECS service to run task deinition
    call create_or_update_ecs_service(
      service, quickstart_cluster, task_definition, service_desired_count,
      array[security_group], 'ENABLED', null, _target_group_name := target_group
    );

  end quickstart
$$;
