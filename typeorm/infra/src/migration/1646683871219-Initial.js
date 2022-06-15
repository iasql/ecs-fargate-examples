const pkg = require('../../package.json');
// TODO replace with your desired project name
const PROJECT_NAME = pkg.name;

// AWS ELASTIC CONTAINER REPOSITORY (ECR)
const region = !process.env.AWS_REGION ? '' : process.env.AWS_REGION;
const REPOSITORY = `${PROJECT_NAME}-repository`;

// AWS IAM
const RUN_ID = process.env.RUN_ID ?? '';
const TASK_ROLE_NAME = `${RUN_ID}_ecsTaskExecRole_${region}`;
const TASK_ASSUME_POLICY = JSON.stringify({
  "Version": "2012-10-17",
  "Statement": [
      {
          "Sid": "",
          "Effect": "Allow",
          "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
      }
  ]
});
const TASK_POLICY_ARN = 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy';

// AWS CLOUDWATCH
const LOG_GROUP = `${PROJECT_NAME}-log-group`

// AWS FARGATE + ELASTIC CONTAINER SERVICE (ECS)
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
const TASK_DEF_RESOURCES = 'vCPU2-8GB'; // task_definition_cpu_memory enum
const TASK_DEF_FAMILY = `${PROJECT_NAME}-td`;
const SERVICE_DESIRED_COUNT = 1;
const IMAGE_TAG = 'latest';
const CONTAINER = `${PROJECT_NAME}-container`;
const CONTAINER_MEM_RESERVATION = 8192; // in MiB
const PROTOCOL = 'TCP';
const CLUSTER = `${PROJECT_NAME}-cluster`;
const SERVICE = `${PROJECT_NAME}-service`;

// AWS SECURITY GROUP + VPC
const SECURITY_GROUP = `${PROJECT_NAME}-security-group`;
const PORT = 8088;

// AWS ELASTIC LOAD BALANCER
const TARGET_GROUP = `${PROJECT_NAME}-target`;
const LOAD_BALANCER = `${PROJECT_NAME}-load-balancer`;

module.exports = class Initial1646683871219 {

  async up(queryRunner) {
    // security group
    await queryRunner.query(`
      BEGIN;
        INSERT INTO security_group (description, group_name)
        VALUES ('${PROJECT_NAME} security group', '${SECURITY_GROUP}');

        INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
        SELECT false, 'tcp', ${PORT}, ${PORT}, '0.0.0.0/0', '${SECURITY_GROUP}', id
        FROM security_group
        WHERE group_name = '${SECURITY_GROUP}';

        INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
        SELECT true, '-1', -1, -1, '0.0.0.0/0', '${SECURITY_GROUP}', id
        FROM security_group
        WHERE group_name = '${SECURITY_GROUP}';
      COMMIT;
    `);

    // load balancer
    await queryRunner.query(`
      BEGIN;
        INSERT INTO target_group
            (target_group_name, target_type, protocol, port, health_check_path)
        VALUES
            ('${TARGET_GROUP}', 'ip', 'HTTP', ${PORT}, '/health');

        INSERT INTO load_balancer
            (load_balancer_name, scheme, load_balancer_type, ip_address_type)
        VALUES
            ('${LOAD_BALANCER}', 'internet-facing', 'application', 'ipv4');

        INSERT INTO load_balancer_security_groups
            (load_balancer_name, security_group_id)
        VALUES
            ('${LOAD_BALANCER}',
              (SELECT id FROM security_group WHERE group_name = '${SECURITY_GROUP}' LIMIT 1));

        INSERT INTO listener
            (load_balancer_name, port, protocol, action_type, target_group_name)
        VALUES
            ('${LOAD_BALANCER}',
              ${PORT}, 'HTTP', 'forward', '${TARGET_GROUP}');
      COMMIT;
    `);

    // container (ECR + ECS)
    await queryRunner.query(`
      BEGIN;
        INSERT INTO log_group (log_group_name) VALUES ('${LOG_GROUP}');

        INSERT INTO repository (repository_name) VALUES ('${REPOSITORY}');

        INSERT INTO cluster (cluster_name) VALUES('${CLUSTER}');

        INSERT INTO role (role_name, assume_role_policy_document, attached_policies_arns)
        VALUES ('${TASK_ROLE_NAME}', '${TASK_ASSUME_POLICY}', array['${TASK_POLICY_ARN}']);

        INSERT INTO task_definition ("family", task_role_name, execution_role_name, cpu_memory)
        VALUES ('${TASK_DEF_FAMILY}', '${TASK_ROLE_NAME}', '${TASK_ROLE_NAME}', '${TASK_DEF_RESOURCES}');

        INSERT INTO container_definition ("name", essential, repository_name, task_definition_id, tag, memory_reservation, host_port, container_port, protocol, log_group_name)
        VALUES (
          '${CONTAINER}', true,
          '${REPOSITORY}',
          (select id from task_definition where family = '${TASK_DEF_FAMILY}' and status is null limit 1),
          '${IMAGE_TAG}', ${CONTAINER_MEM_RESERVATION}, ${PORT}, ${PORT}, '${PROTOCOL.toLowerCase()}', '${LOG_GROUP}'
        );
      COMMIT;
    `);

    // create ECS service and associate it to security group
    await queryRunner.query(`
      BEGIN;
        INSERT INTO service ("name", desired_count, assign_public_ip, subnets, cluster_name, task_definition_id, target_group_name)
        VALUES (
          '${SERVICE}', ${SERVICE_DESIRED_COUNT}, 'ENABLED',
          (select array(select subnet_id from subnet inner join vpc on vpc.id = subnet.vpc_id where is_default = true limit 3)),
          '${CLUSTER}',
          (select id from task_definition where family = '${TASK_DEF_FAMILY}' order by revision desc limit 1),
          '${TARGET_GROUP}'
        );

        INSERT INTO service_security_groups (service_name, security_group_id)
        VALUES (
          '${SERVICE}',
          (select id from security_group where group_name = '${SECURITY_GROUP}' limit 1)
        );
      COMMIT;
    `);

    // apply the changes
    await queryRunner.query(`
      SELECT * FROM iasql_apply();
    `);
  }

  // order matters
  async down(queryRunner) {
    // delete ECS service
    await queryRunner.query(`
      BEGIN;
        DELETE FROM service_security_groups
        USING service
        WHERE name = '${SERVICE}';

        DELETE FROM service WHERE name = '${SERVICE}';
      COMMIT;
    `);

    // delete ECS + ECR
    await queryRunner.query(`    
      BEGIN;
        DELETE FROM container_definition
        USING task_definition
        WHERE container_definition.task_definition_id = task_definition.id and task_definition.family = '${TASK_DEF_FAMILY}';

        DELETE FROM task_definition WHERE family = '${TASK_DEF_FAMILY}';

        DELETE FROM role WHERE role_name = '${TASK_ROLE_NAME}';

        DELETE FROM cluster WHERE cluster_name = '${CLUSTER}';

        DELETE FROM repository WHERE repository_name = '${REPOSITORY}';

        DELETE FROM log_group WHERE log_group_name = '${LOG_GROUP}';
      COMMIT;
    `);

    // delete ELB
    await queryRunner.query(`
      BEGIN;
        DELETE FROM listener
        WHERE load_balancer_name = '${LOAD_BALANCER}' AND target_group_name = '${TARGET_GROUP}';

        DELETE FROM load_balancer_security_groups
        WHERE load_balancer_name = '${LOAD_BALANCER}';

        DELETE FROM load_balancer
        WHERE load_balancer_name = '${LOAD_BALANCER}';

        DELETE FROM target_group
        WHERE target_group_name = '${TARGET_GROUP}';
      COMMIT;
    `);

    // delete security groups
    await queryRunner.query(`
      BEGIN;
        DELETE FROM security_group_rule
        USING security_group
        WHERE security_group.id = security_group_rule.security_group_id AND security_group.group_name = '${SECURITY_GROUP}';

        DELETE FROM security_group WHERE group_name = '${SECURITY_GROUP}';
      COMMIT;
    `);

    // apply the changes
    await queryRunner.query(`
      SELECT * FROM iasql_apply();
    `);
  }
}
