// Enforce Conventional Commits so release-please can derive the changelog and
// version bumps. See the prefix table in the project constitution (Article VI).
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
