using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class SignalData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "NeedsNudge",
                table: "MailThreads",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ReplyState",
                table: "MailThreads",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StateSince",
                table: "MailThreads",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.Sql("""
                WITH latest AS (
                    SELECT DISTINCT ON (t."Id") t."Id",
                        CASE WHEN f."SpecialUse" = 'Sent' OR lower(m."FromAddr") = lower(c."Email")
                            THEN 'Awaiting' ELSE 'ToReply' END AS state,
                        coalesce(m."InternalDate", m."MessageDate", m."FetchedAt", t."LastDate", t."FirstDate", CURRENT_TIMESTAMP) AS since
                    FROM "MailThreads" t
                    JOIN "MailboxConnections" c ON c."Id" = t."MailboxConnectionId"
                    LEFT JOIN "MailMessages" m ON m."ThreadId" = t."Id"
                    LEFT JOIN "MailboxFolders" f ON f."Id" = m."FolderId"
                    ORDER BY t."Id", coalesce(m."InternalDate", m."MessageDate", m."FetchedAt") DESC NULLS LAST, m."Id" DESC
                )
                UPDATE "MailThreads" t SET "ReplyState" = latest.state, "StateSince" = latest.since
                FROM latest WHERE t."Id" = latest."Id";
                """);

            migrationBuilder.CreateTable(
                name: "ProjectFlights",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectFlights", x => x.Id);
                    table.CheckConstraint("CK_ProjectFlights_Dates", "\"EndDate\" >= \"StartDate\"");
                    table.ForeignKey(
                        name: "FK_ProjectFlights_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ThreadResponseTimes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SendOperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: true),
                    InboundMessageKey = table.Column<string>(type: "text", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Seconds = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ThreadResponseTimes", x => x.Id);
                    table.CheckConstraint("CK_ThreadResponseTimes_Seconds", "\"Seconds\" >= 0");
                    table.ForeignKey(
                        name: "FK_ThreadResponseTimes_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ThreadResponseTimes_MailThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "MailThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ThreadResponseTimes_MailboxConnections_MailboxConnectionId",
                        column: x => x.MailboxConnectionId,
                        principalTable: "MailboxConnections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ThreadResponseTimes_SendOperations_SendOperationId",
                        column: x => x.SendOperationId,
                        principalTable: "SendOperations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ThreadResponseTimes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MailThreads_ReplyState_StateSince",
                table: "MailThreads",
                columns: new[] { "ReplyState", "StateSince" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectFlights_ProjectId_StartDate",
                table: "ProjectFlights",
                columns: new[] { "ProjectId", "StartDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectFlights_StartDate",
                table: "ProjectFlights",
                column: "StartDate");

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_CompanyId",
                table: "ThreadResponseTimes",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_MailboxConnectionId_InboundMessageKey",
                table: "ThreadResponseTimes",
                columns: new[] { "MailboxConnectionId", "InboundMessageKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_SendOperationId",
                table: "ThreadResponseTimes",
                column: "SendOperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_SentAt",
                table: "ThreadResponseTimes",
                column: "SentAt");

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_ThreadId",
                table: "ThreadResponseTimes",
                column: "ThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_ThreadResponseTimes_UserId",
                table: "ThreadResponseTimes",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectFlights");

            migrationBuilder.DropTable(
                name: "ThreadResponseTimes");

            migrationBuilder.DropIndex(
                name: "IX_MailThreads_ReplyState_StateSince",
                table: "MailThreads");

            migrationBuilder.DropColumn(
                name: "NeedsNudge",
                table: "MailThreads");

            migrationBuilder.DropColumn(
                name: "ReplyState",
                table: "MailThreads");

            migrationBuilder.DropColumn(
                name: "StateSince",
                table: "MailThreads");
        }
    }
}
