module.exports = class Install1646683871211 {

  // make sure the correct iasql modules are installed or the tables won't exist
  async up(queryRunner) {
    await queryRunner.query(`
      SELECT * FROM iasql_install(
        'aws_ecs_simplified'
      );
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      SELECT * FROM iasql_uninstall(
        'aws_ecs_simplified'
      );
    `);
  }
}
