using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class MailboxAccess : Migration
    {
        public const string ExistingAccessSql = """
            INSERT INTO "MailboxAccess" ("MailboxConnectionId", "UserId", "GrantedByUserId", "GrantedAt")
            SELECT c."Id", u."Id", NULL, CURRENT_TIMESTAMP
            FROM "MailboxConnections" c
            JOIN "Users" owner ON owner."Id" = c."UserId"
            JOIN "Users" u ON u."OrganizationId" = owner."OrganizationId"
            ON CONFLICT DO NOTHING;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<List<Guid>>(
                name: "MailboxIds",
                table: "Invitations",
                type: "uuid[]",
                nullable: false,
                defaultValueSql: "ARRAY[]::uuid[]");

            migrationBuilder.CreateTable(
                name: "MailboxAccess",
                columns: table => new
                {
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    GrantedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MailboxAccess", x => new { x.MailboxConnectionId, x.UserId });
                    table.ForeignKey(
                        name: "FK_MailboxAccess_MailboxConnections_MailboxConnectionId",
                        column: x => x.MailboxConnectionId,
                        principalTable: "MailboxConnections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MailboxAccess_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MailboxAccess_UserId",
                table: "MailboxAccess",
                column: "UserId");

            migrationBuilder.Sql(ExistingAccessSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MailboxAccess");

            migrationBuilder.DropColumn(
                name: "MailboxIds",
                table: "Invitations");
        }
    }
}
