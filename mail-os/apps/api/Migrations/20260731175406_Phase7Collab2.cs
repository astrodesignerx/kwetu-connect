using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class Phase7Collab2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "MailThreadId",
                table: "ThreadNotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssignmentThreadId",
                table: "MailThreads",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThreadNotes_MailThreadId",
                table: "ThreadNotes",
                column: "MailThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_MailThreads_AssignmentThreadId",
                table: "MailThreads",
                column: "AssignmentThreadId");

            migrationBuilder.AddForeignKey(
                name: "FK_MailThreads_ThreadAssignments_AssignmentThreadId",
                table: "MailThreads",
                column: "AssignmentThreadId",
                principalTable: "ThreadAssignments",
                principalColumn: "ThreadId");

            migrationBuilder.AddForeignKey(
                name: "FK_ThreadNotes_MailThreads_MailThreadId",
                table: "ThreadNotes",
                column: "MailThreadId",
                principalTable: "MailThreads",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MailThreads_ThreadAssignments_AssignmentThreadId",
                table: "MailThreads");

            migrationBuilder.DropForeignKey(
                name: "FK_ThreadNotes_MailThreads_MailThreadId",
                table: "ThreadNotes");

            migrationBuilder.DropIndex(
                name: "IX_ThreadNotes_MailThreadId",
                table: "ThreadNotes");

            migrationBuilder.DropIndex(
                name: "IX_MailThreads_AssignmentThreadId",
                table: "MailThreads");

            migrationBuilder.DropColumn(
                name: "MailThreadId",
                table: "ThreadNotes");

            migrationBuilder.DropColumn(
                name: "AssignmentThreadId",
                table: "MailThreads");
        }
    }
}
