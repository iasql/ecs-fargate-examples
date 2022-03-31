module.exports = class Install1646683871211 {

  // make sure the correct iasql modules are installed or the tables won't exist
  async up(queryRunner) {
    await queryRunner.query(`
      SELECT * FROM iasql_install(
        'aws_vpc',
        'aws_security_group',
        'aws_elb',
        'aws_cloudwatch',
        'aws_ecr',
        'aws_ecs_fargate',
        'aws_rds'
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      SELECT * FROM iasql_uninstall(
        'aws_vpc',
        'aws_security_group',
        'aws_elb',
        'aws_cloudwatch',
        'aws_ecr',
        'aws_ecs_fargate',
        'aws_rds'
      );
    `);
  }
}
