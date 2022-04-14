const { PrismaClient, load_balancer_scheme_enum, task_definition_cpu_memory_enum } = require('@prisma/client')

const pkg = require('./package.json');
// TODO replace with your desired project name
const PROJECT_NAME = pkg.name;

const REGION = process.env.AWS_REGION ?? '';
const CONTAINER_MEM_RESERVATION = 8192; // in MiB
const PORT = 8088;

const prisma = new PrismaClient()

// TODO `prisma generate` using camelcase
// TODO use Redwood JS data migrations https://redwoodjs.com/docs/data-migrations
// or add uniqueness constraints and use upserts to make the script idempotent
async function main() {
  /* AWS SECURITY GROUPS */
  const sg = await prisma.security_group.create({
    data: {
      description: `${PROJECT_NAME} security group`, group_name: `${PROJECT_NAME}-security-group`,
    },
  });
  // TODO replace cidr with string or prisma to support cidr so we can use entity
  await prisma.$executeRawUnsafe(`
    INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
    VALUES (false, 'tcp', ${PORT}, ${PORT}, '0.0.0.0/0', '${PROJECT_NAME}-security-group', ${sg.id});
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO security_group_rule (is_egress, ip_protocol, from_port, to_port, cidr_ipv4, description, security_group_id)
    VALUES (true, '-1', -1, -1, '0.0.0.0/0', '${PROJECT_NAME}-security-group', ${sg.id});
  `);

  // AWS ELASTIC LOAD BALANCER
  const tg = await prisma.target_group.create({
    data: {
      target_group_name: `${PROJECT_NAME}-target`,
      target_type: 'ip',
      protocol: 'HTTP',
      port: PORT,
      health_check_path: '/health'
    },
  });
  const lb = await prisma.load_balancer.create({
    data: {
      load_balancer_name: `${PROJECT_NAME}-load-balancer`,
      scheme: load_balancer_scheme_enum.internet_facing,
      load_balancer_type: 'application',
      ip_address_type: 'ipv4',
      load_balancer_security_groups: {
        create: {
          security_group_id: sg.id,
        }
      }
    }
  });
  const listener = await prisma.listener.create({
    data: {
      load_balancer_name: lb.load_balancer_name,
      port: PORT,
      protocol: 'HTTP',
      action_type: 'forward',
      target_group_name: tg.target_group_name,
    }
  });
  const role = await prisma.role.create({
    data: {
      role_name: `ecsTaskExecRole${REGION}`,
      assume_role_policy_document: '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}',
      attached_policies_arns: ['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy']
    }
  });
  const repo = await prisma.repository.create({
    data: { repository_name: `${PROJECT_NAME}-repository`}
  });
  const logGroup = await prisma.log_group.create({
    data: { log_group_name: `${PROJECT_NAME}-log-group`}
  });
  const cluster = await prisma.cluster.create({
    data: { cluster_name: `${PROJECT_NAME}-cluster`}
  });
  // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
  const task = await prisma.task_definition.create({
    data: {
      family: `${PROJECT_NAME}-td`, cpu_memory: task_definition_cpu_memory_enum.vCPU2_8GB,
      task_role_name: role.role_name, execution_role_name: role.role_name,
    }
  });
  const container = await prisma.container_definition.create({
    data: {
      name: `${PROJECT_NAME}-container`, essential: true,
      log_group_name: logGroup.log_group_name,
      repository_name: repo.repository_name, task_definition_id: task.id, tag: 'latest',
      memory_reservation: CONTAINER_MEM_RESERVATION,
      host_port: PORT, container_port: PORT, protocol: 'tcp',
    }
  });
  // select array(select subnet_id from subnet inner join vpc on vpc.id = subnet.vpc_id where is_default = true limit 3),
  const vpc_res = await prisma.vpc.findFirst({
    where: { is_default: true },
    select: {
      subnet: {
        select: {
          subnet_id: true
        }
      }
    }
  });
  const subnet_ids = vpc_res.subnet.map(s => s.subnet_id);
  // create ECS service and associate it to security group
  const service = await prisma.service.create({
    data: {
      name: `${PROJECT_NAME}-service`, desired_count: 1, assign_public_ip: 'ENABLED',
      cluster_name: cluster.cluster_name, task_definition_id: task.id, target_group_name: tg.target_group_name,
      subnets: subnet_ids,
      service_security_groups: {
        create: {
          security_group_id: sg.id,
        }
      }
    }
  });

  const apply = await prisma.$queryRaw`SELECT * from iasql_apply();`
  console.dir(apply)
}

main()
  .catch((e) => {
    throw e
  })
  .finally(async () => {
    await prisma.$disconnect()
  })