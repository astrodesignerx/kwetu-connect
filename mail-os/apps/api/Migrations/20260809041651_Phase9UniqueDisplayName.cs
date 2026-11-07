using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <summary>
    /// Display names became login identifiers, so they have to be unique.
    ///
    /// Written as raw SQL because the uniqueness is on <c>lower("DisplayName")</c> — an
    /// expression index, which EF's model builder cannot express. It therefore does not
    /// appear in the model snapshot; EF only drops indexes it knows about, so later
    /// migrations leave it alone.
    ///
    /// Application-level validation in AuthController gives the friendly error; this
    /// index is what makes a concurrent insert impossible.
    /// </summary>
    public partial class Phase9UniqueDisplayName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fails loudly if the deployment already has case-insensitive duplicates.
            // Resolve them by renaming before applying, rather than silently letting two
            // accounts answer to the same username.
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "IX_Users_OrganizationId_DisplayName_Lower"
                ON "Users" ("OrganizationId", lower("DisplayName"));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_Users_OrganizationId_DisplayName_Lower";
                """);
        }
    }
}
