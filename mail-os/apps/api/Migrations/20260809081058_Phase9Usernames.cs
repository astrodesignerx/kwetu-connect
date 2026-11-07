using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <summary>
    /// Splits the login handle out of the display name.
    ///
    /// Order matters: the column has to be added, then backfilled with distinct values,
    /// and only then made unique. EF's generated version added the column with an empty
    /// default and created the unique index immediately, which fails on any deployment
    /// with more than one existing account.
    /// </summary>
    public partial class Phase9Usernames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "Users",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            // Derive a handle for every existing account: "Kwetu Admin" -> kwetuadmin.
            // Falls back to the email local part, then to "user"; pads anything under
            // three characters; and suffixes collisions 2, 3, … deterministically by
            // creation order so the oldest account keeps the clean handle.
            migrationBuilder.Sql("""
                WITH base AS (
                    SELECT
                        u."Id",
                        u."CreatedAt",
                        left(
                            CASE
                                WHEN length(c.candidate) < 3 THEN c.candidate || 'user'
                                ELSE c.candidate
                            END,
                            28
                        ) AS candidate
                    FROM "Users" u
                    CROSS JOIN LATERAL (
                        SELECT COALESCE(
                            NULLIF(btrim(regexp_replace(lower(u."DisplayName"), '[^a-z0-9._-]+', '', 'g'), '._-'), ''),
                            NULLIF(btrim(regexp_replace(lower(split_part(u."Email", '@', 1)), '[^a-z0-9._-]+', '', 'g'), '._-'), ''),
                            'user'
                        ) AS candidate
                    ) c
                ),
                numbered AS (
                    SELECT
                        "Id",
                        candidate,
                        row_number() OVER (PARTITION BY candidate ORDER BY "CreatedAt", "Id") AS rn
                    FROM base
                )
                UPDATE "Users" u
                SET "Username" = CASE
                    WHEN n.rn = 1 THEN n.candidate
                    ELSE n.candidate || n.rn::text
                END
                FROM numbered n
                WHERE u."Id" = n."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            // Display names are free text again now that they are not a credential, so
            // the case-insensitive unique index added in Phase9UniqueDisplayName goes.
            migrationBuilder.Sql("""
                DROP INDEX IF EXISTS "IX_Users_OrganizationId_DisplayName_Lower";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Restoring the display-name index can fail if duplicates were created while
            // it was absent; that is a genuine conflict for an operator to resolve rather
            // than something to paper over.
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "IX_Users_OrganizationId_DisplayName_Lower"
                ON "Users" ("OrganizationId", lower("DisplayName"));
                """);

            migrationBuilder.DropIndex(
                name: "IX_Users_Username",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Users");

            migrationBuilder.AlterColumn<string>(
                name: "DisplayName",
                table: "Users",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128);
        }
    }
}
