const pkg = require('../../package.json');
// TODO replace with your desired project name
const PROJECT_NAME = pkg.name;

// AWS FARGATE + ELASTIC CONTAINER SERVICE (ECS)
// https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
const TASK_DEF_RESOURCES = 'vCPU2-8GB'; // task_definition_cpu_memory enum
const SERVICE_DESIRED_COUNT = 1;
const IMAGE_TAG = 'latest';
const PORT = 8088;

module.exports = class Initial1646683871219 {

  async up(queryRunner) {
    // ECS simplified service
    await queryRunner.query(`
      INSERT INTO ecs_simplified (app_name, desired_count, app_port, cpu_mem, image_tag, public_ip)
      VALUES ('${PROJECT_NAME}', ${SERVICE_DESIRED_COUNT}, ${PORT}, '${TASK_DEF_RESOURCES}', '${IMAGE_TAG}', true);
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
      DELETE FROM ecs_simplified
      WHERE app_name = '${PROJECT_NAME}';
    `);

    // apply the changes
    await queryRunner.query(`
      SELECT * FROM iasql_apply();
    `);
  }
}
