using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class SendGuards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DraftId",
                table: "SendOperations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EffectivePayloadJson",
                table: "SendOperations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                table: "MailDrafts",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.CreateTable(
                name: "DraftTombstones",
                columns: table => new
                {
                    DraftId = table.Column<Guid>(type: "uuid", nullable: false),
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DraftTombstones", x => x.DraftId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DraftTombstones_MailboxConnectionId",
                table: "DraftTombstones",
                column: "MailboxConnectionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DraftTombstones");

            migrationBuilder.DropColumn(
                name: "DraftId",
                table: "SendOperations");

            migrationBuilder.DropColumn(
                name: "EffectivePayloadJson",
                table: "SendOperations");

            migrationBuilder.DropColumn(
                name: "xmin",
                table: "MailDrafts");
        }
    }
}
