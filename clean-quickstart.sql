-- Quickstart PL/SQL template to clean an ECS fargate service.

set project.name = :project_name;
do $$
<<quickstart>>
  declare
    project_name text := current_setting('project.name');

    port integer := 8088;
    target_group text := project_name || '-target-group';
    load_balancer text := project_name || '-load-balancer';
    repository text := project_name || '-repository';
    quickstart_cluster text := project_name || '-cluster';
    container text := project_name || '-container';
    task_definition text := project_name || '-task-definition';
    security_group text := project_name || '-security-group';
    service text := project_name || '-service';
  begin

    call delete_ecs_service(service);

    call delete_container_definition(container, task_definition);

    call delete_task_definition(task_definition);

    call delete_ecs_cluster(quickstart_cluster);

    call delete_ecr_public_repository(repository);

    call delete_aws_listener(load_balancer, port, 'HTTP', 'forward', target_group);

    call delete_aws_load_balancer(load_balancer);

    call delete_aws_target_group(target_group);

    call delete_aws_security_group(security_group);

  end quickstart
$$;
