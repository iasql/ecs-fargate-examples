const pkg = require('../../package.json');
// TODO replace with your desired project name
const PROJECT_NAME = pkg.name;

// AWS ELASTIC CONTAINER REPOSITORY (ECR)
const region = !process.env.AWS_REGION ? '' : `-${process.env.AWS_REGION}`;
const REPOSITORY = `${PROJECT_NAME}-repository${region}`;

// AWS FARGATE + ELASTIC CONTAINER SERVICE (ECS)
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
const TASK_DEF_RESOURCES = '2vCPU-8GB'; // task_definition_cpu_memory enum
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
            (target_group_name, target_type, protocol, port, vpc, health_check_path)
        VALUES
            ('${TARGET_GROUP}', 'ip', 'HTTP', ${PORT}, 'default', '/health');

        INSERT INTO load_balancer
            (load_balancer_name, scheme, vpc, load_balancer_type, ip_address_type)
        VALUES
            ('${LOAD_BALANCER}', 'internet-facing', 'default', 'application', 'ipv4');

        INSERT INTO load_balancer_security_groups
            (load_balancer_id, security_group_id)
        VALUES
            ((SELECT id FROM load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1),
              (SELECT id FROM security_group WHERE group_name = '${SECURITY_GROUP}' LIMIT 1));

        INSERT INTO listener
            (load_balancer_id, port, protocol, action_type, target_group_id)
        VALUES
            ((SELECT id FROM load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1),
              ${PORT}, 'HTTP', 'forward', (SELECT id FROM target_group WHERE target_group_name = '${TARGET_GROUP}' LIMIT 1));
      COMMIT;
    `);

    // container (ECR + ECS)
    await queryRunner.query(`
      BEGIN;
        INSERT INTO public_repository (repository_name) VALUES ('${REPOSITORY}');

        INSERT INTO cluster (cluster_name) VALUES('${CLUSTER}');

        INSERT INTO task_definition ("family", cpu_memory)
        VALUES ('${TASK_DEF_FAMILY}', '${TASK_DEF_RESOURCES}');

        INSERT INTO container_definition ("name", essential, public_repository_id, task_definition_id, tag, memory_reservation, host_port, container_port, protocol)
        VALUES (
          '${CONTAINER}', true,
          (select id from public_repository where repository_name = '${REPOSITORY}' limit 1),
          (select id from task_definition where family = '${TASK_DEF_FAMILY}' and status is null limit 1),
          '${IMAGE_TAG}', ${CONTAINER_MEM_RESERVATION}, ${PORT}, ${PORT}, '${PROTOCOL.toLowerCase()}'
        );
      COMMIT;
    `);

    // create ECS service and associate it to security group
    await queryRunner.query(`
      BEGIN;
        INSERT INTO service ("name", desired_count, assign_public_ip, subnets, cluster_id, task_definition_id, target_group_id)
        VALUES (
          '${SERVICE}', ${SERVICE_DESIRED_COUNT}, 'ENABLED',
          (select array(select subnet_id from subnet inner join vpc on vpc.id = subnet.vpc_id where is_default = true limit 3)),
          (select id from cluster where cluster_name = '${CLUSTER}'),
          (select id from task_definition where family = '${TASK_DEF_FAMILY}' order by revision desc limit 1),
          (select id from target_group where target_group_name = '${TARGET_GROUP}' limit 1)
        );

        INSERT INTO service_security_groups (service_id, security_group_id)
        VALUES (
          (select id from service where name = '${SERVICE}' limit 1),
          (select id from security_group where group_name = '${SECURITY_GROUP}' limit 1)
        );
      COMMIT;
    `);

    // apply the changes
    await queryRunner.query(`
      SELECT iasql_apply();
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

        DELETE FROM cluster WHERE cluster_name = '${CLUSTER}';

        DELETE FROM public_repository WHERE repository_name = '${REPOSITORY}';
      COMMIT;
    `);

    // delete ELB
    await queryRunner.query(`
      BEGIN;
        DELETE FROM listener
        WHERE load_balancer_id = (SELECT id FROM load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1)
          and port = ${PORT} and protocol = 'HTTP' and action_type = 'forward'
          and target_group_id = (SELECT id FROM target_group WHERE target_group_name = '${TARGET_GROUP}' LIMIT 1);

        DELETE FROM load_balancer_security_groups
        WHERE load_balancer_id = (SELECT id FROM load_balancer WHERE load_balancer_name = '${LOAD_BALANCER}' LIMIT 1);

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
      SELECT iasql_apply();
    `);
  }
}
