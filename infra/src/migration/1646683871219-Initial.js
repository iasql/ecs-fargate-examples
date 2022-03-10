const pkg = require('../../package.json');

function randomIntFromInterval(min, max) { // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min)
}

// TODO replace with your desired project name
const PROJECT_NAME = `${pkg.name}${randomIntFromInterval(1, 99)}`

// AWS ELASTIC CONTAINER REPOSITORY (ECR)
const REPOSITORY = `${PROJECT_NAME}-repository}`;

// AWS FARGATE + ELASTIC CONTAINER SERVICE (ECS)
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
const TASK_DEF_RESOURCES = '2vCPU-8GB'; // aws_task_definition_cpu_memory enum
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

  // make sure the correct iasql modules are installed or the tables won't exist
  // this will be easier once we have https://github.com/iasql/iasql-engine/issues/468
  async up(queryRunner) {
    // security group
    await queryRunner.query(`
      BEGIN;
        INSERT INTO aws_security_group (description, group_name)
        VALUES ('${PROJECT_NAME} security group', '${SECURITY_GROUP}');

        INSERT INTO aws_security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
        SELECT false, 'tcp', ${PORT}, ${PORT}, '0.0.0.0/0', '${SECURITY_GROUP}', id
        FROM aws_security_group
        WHERE group_name = '${SECURITY_GROUP}';

        INSERT INTO aws_security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
        SELECT true, '-1', -1, -1, '0.0.0.0/0', '${SECURITY_GROUP}', id
        FROM aws_security_group
        WHERE group_name = '${SECURITY_GROUP}';
      COMMIT;
    `);

    // load balancer
    await queryRunner.query(`
      BEGIN;
        INSERT INTO aws_target_group
            (target_group_name, target_type, protocol, port, vpc, health_check_path)
        VALUES
            ('${TARGET_GROUP}', 'ip', 'HTTP', ${PORT}, 'default', '/health');

        INSERT INTO aws_load_balancer
            (load_balancer_name, scheme, vpc, load_balancer_type, ip_address_type)
        VALUES
            ('${LOAD_BALANCER}', 'internet-facing', 'default', 'application', 'ipv4');

        INSERT INTO aws_load_balancer_security_groups
            (aws_load_balancer_id, aws_security_group_id)
        VALUES
            ((SELECT id FROM aws_load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1),
              (SELECT id FROM aws_security_group WHERE group_name = '${SECURITY_GROUP}' LIMIT 1));

        INSERT INTO aws_listener
            (aws_load_balancer_id, port, protocol, action_type, target_group_id)
        VALUES
            ((SELECT id FROM aws_load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1),
              ${PORT}, 'HTTP', 'forward', (SELECT id FROM aws_target_group WHERE target_group_name = '${TARGET_GROUP}' LIMIT 1));
      COMMIT;
    `);

    // container (ECR + ECS)
    await queryRunner.query(`
      BEGIN;
        INSERT INTO aws_public_repository (repository_name) VALUES ('${REPOSITORY}');

        INSERT INTO aws_cluster (cluster_name) VALUES('${CLUSTER}');

        INSERT INTO aws_task_definition ("family", cpu_memory)
        VALUES ('${TASK_DEF_FAMILY}', '${TASK_DEF_RESOURCES}');

        INSERT INTO aws_container_definition ("name", essential, public_repository_id, task_definition_id, tag, memory_reservation, host_port, container_port, protocol)
        VALUES (
          '${CONTAINER}', true,
          (select id from aws_public_repository where repository_name = '${REPOSITORY}' limit 1),
          (select id from aws_task_definition where family = '${TASK_DEF_FAMILY}' and status is null limit 1),
          '${IMAGE_TAG}', ${CONTAINER_MEM_RESERVATION}, ${PORT}, ${PORT}, '${PROTOCOL.toLowerCase()}'
        );
      COMMIT;
    `);

    // create ECS service and associate it to security group
    await queryRunner.query(`
      BEGIN;
        INSERT INTO aws_service ("name", desired_count, assign_public_ip, subnets, cluster_id, task_definition_id, target_group_id)
        VALUES (
          '${SERVICE}', ${SERVICE_DESIRED_COUNT}, 'ENABLED',
          (select array(select subnet_id from aws_subnet inner join aws_vpc on aws_vpc.id = aws_subnet.vpc_id where is_default = true limit 3)),
          (select id from aws_cluster where cluster_name = '${CLUSTER}'),
          (select id from aws_task_definition where family = '${TASK_DEF_FAMILY}' order by revision desc limit 1),
          (select id from aws_target_group where target_group_name = '${TARGET_GROUP}' limit 1)
        );

        INSERT INTO aws_service_security_groups (aws_service_id, aws_security_group_id)
        VALUES (
          (select id from aws_service where name = '${SERVICE}' limit 1),
          (select id from aws_security_group where group_name = '${SECURITY_GROUP}' limit 1)
        );
      COMMIT;
    `);
  }

  // order matters
  async down(queryRunner) {
    // delete ECS service
    await queryRunner.query(`
      BEGIN;
        DELETE FROM aws_service_security_groups
        USING aws_service
        WHERE name = '${SERVICE}';

        DELETE FROM aws_service WHERE name = '${SERVICE}';
      COMMIT;
    `);

    // delete ECS + ECR
    await queryRunner.query(`    
      BEGIN;
        DELETE FROM aws_container_definition
        USING aws_task_definition
        WHERE aws_container_definition.task_definition_id = aws_task_definition.id and aws_task_definition.family = '${TASK_DEF_FAMILY}';

        DELETE FROM aws_task_definition WHERE family = '${TASK_DEF_FAMILY}';

        DELETE FROM aws_cluster WHERE cluster_name = '${CLUSTER}';

        DELETE FROM aws_public_repository WHERE repository_name = '${REPOSITORY}';
      COMMIT;
    `);

    // delete ELB
    await queryRunner.query(`
      BEGIN;
        DELETE FROM aws_listener
        WHERE aws_load_balancer_id = (SELECT id FROM aws_load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1)
          and port = ${PORT} and protocol = 'HTTP' and action_type = 'forward'
          and target_group_id = (SELECT id FROM aws_target_group WHERE target_group_name = '${TARGET_GROUP}' LIMIT 1);

        DELETE FROM aws_load_balancer_security_groups
        WHERE aws_load_balancer_id = (SELECT id FROM aws_load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1);

        DELETE FROM aws_load_balancer
        WHERE load_balancer_name = '${LOAD_BALANCER}';

        DELETE FROM aws_target_group
        WHERE target_group_name = '${TARGET_GROUP}';
      COMMIT;
    `);

    // delete security groups
    await queryRunner.query(`
      BEGIN;
        DELETE FROM aws_security_group_rule
        USING aws_security_group
        WHERE aws_security_group.id = aws_security_group_rule.security_group_id AND aws_security_group.group_name = '${SECURITY_GROUP}';

        DELETE FROM aws_security_group WHERE group_name = '${SECURITY_GROUP}';
      COMMIT;
    `);
  }
}
