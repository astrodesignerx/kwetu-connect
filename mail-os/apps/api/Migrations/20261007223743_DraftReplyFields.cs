using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class DraftReplyFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReplyToThreadId",
                table: "MailDrafts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SkipBrandWrap",
                table: "MailDrafts",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReplyToThreadId",
                table: "MailDrafts");

            migrationBuilder.DropColumn(
                name: "SkipBrandWrap",
                table: "MailDrafts");
        }
    }
}
