-- Quickstart PL/SQL template to launch an ECS fargate service.
-- Cofigure your project updating the first set of variables.

do $$
<<quickstart>>
  declare
    project_name text := 'quickstart';
    port integer := 8088;
    target_group_health_path text := '/health';
    container_memory_reservation integer := 8192; -- in MiB
    image_tag text := 'latest';
    task_definition_resources task_definition_cpu_memory_enum := '2vCPU-8GB';
    ecs_task_execution_role text := '<AWS_ECS_EXEC_ROLE>';  -- Need to be filled
    service_desired_count integer := 1;

    default_vpc text;
    default_vpc_id integer;
    sn record;
    default_subnets text[];
    target_group text := project_name || '-target-group';
    load_balancer text := project_name || '-load-balancer';
    repository text := project_name || '-repository';
    quickstart_cluster text := project_name || '-cluster';
    container text := project_name || '-container';
    task_definition text := project_name || '-task-definition';
    security_group text := project_name || '-security-group';
    service text := project_name || '-service';
    cloud_watch_log_group text := project_name || '-log-group';
  begin
    -- Get default VPC
    select vpc_id, id into default_vpc, default_vpc_id
    from aws_vpc
    where is_default = true
    limit 1;

    -- Get default subnets
    for sn in
      select *
      from aws_subnet
      where vpc_id = default_vpc_id
    loop
      default_subnets := array_append(default_subnets, sn.subnet_id::text);
    end loop;

    -- Security group
    call create_aws_security_group(
      security_group, security_group,
      ('[{"isEgress": false, "ipProtocol": "tcp", "fromPort": ' || port || ', "toPort": ' || port || ', "cidrIpv4": "0.0.0.0/0"}, {"isEgress": true, "ipProtocol": -1, "fromPort": -1, "toPort": -1, "cidrIpv4": "0.0.0.0/0"}]')::jsonb
    );

    -- Target group
    call create_aws_target_group(
      target_group, 'ip', port, default_vpc, 'HTTP', target_group_health_path
    );

    -- Load balancer
    call create_aws_load_balancer(
      load_balancer, 'internet-facing', default_vpc, 'application', default_subnets, 'ipv4', array[security_group]
    );

    -- Load balancer listener
    call create_aws_listener(load_balancer, port, 'HTTP', 'forward', target_group);

    -- ECR repository
    call create_ecr_repository(repository);

    -- ECS Cluster
    call create_ecs_cluster(quickstart_cluster);

    -- ECS Task definition
    call create_task_definition(
      task_definition, ecs_task_execution_role, ecs_task_execution_role,
      'awsvpc', array['FARGATE']::compatibility_name_enum[], task_definition_resources
    );

    -- Cloudwatch log group
    call create_cloudwatch_log_group(cloud_watch_log_group);

    -- Container definition for task definition created
    call create_container_definition(
      task_definition, container, true, container_memory_reservation, port, port, 'tcp',
      ('{"PORT": ' || port || '}')::json, image_tag,
      _ecr_repository_name := repository, _cloud_watch_log_group := cloud_watch_log_group
    );

    -- ECS service to run task deinition
    call create_ecs_service(
      service, quickstart_cluster, task_definition, service_desired_count, 'FARGATE',
      'REPLICA', default_subnets, array[security_group], 'ENABLED', target_group
    );

  end quickstart
$$;
