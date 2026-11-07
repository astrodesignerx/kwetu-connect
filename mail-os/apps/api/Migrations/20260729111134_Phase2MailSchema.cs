using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using NpgsqlTypes;

#nullable disable

namespace Kompanion.Api.Migrations
{
    /// <inheritdoc />
    public partial class Phase2MailSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSyncCompletedAt",
                table: "MailboxConnections",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SyncError",
                table: "MailboxConnections",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SyncState",
                table: "MailboxConnections",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "Contacts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<int>(type: "integer", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: true),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    MessageCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contacts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MailboxFolders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FullName = table.Column<string>(type: "text", nullable: false),
                    UidValidity = table.Column<long>(type: "bigint", nullable: false),
                    LastUid = table.Column<long>(type: "bigint", nullable: true),
                    SpecialUse = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    IsExcluded = table.Column<bool>(type: "boolean", nullable: false),
                    LastSyncedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MailboxFolders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MailboxFolders_MailboxConnections_MailboxConnectionId",
                        column: x => x.MailboxConnectionId,
                        principalTable: "MailboxConnections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MailThreads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RootKey = table.Column<string>(type: "text", nullable: false),
                    NormalizedSubject = table.Column<string>(type: "text", nullable: true),
                    Subject = table.Column<string>(type: "text", nullable: true),
                    MessageCount = table.Column<int>(type: "integer", nullable: false),
                    FirstDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    HasUnread = table.Column<bool>(type: "boolean", nullable: false),
                    HasAttachments = table.Column<bool>(type: "boolean", nullable: false),
                    Participants = table.Column<string>(type: "text", nullable: true),
                    Snippet = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MailThreads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MailThreads_MailboxConnections_MailboxConnectionId",
                        column: x => x.MailboxConnectionId,
                        principalTable: "MailboxConnections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MailMessages",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MailboxConnectionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FolderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ThreadId = table.Column<Guid>(type: "uuid", nullable: true),
                    Uid = table.Column<long>(type: "bigint", nullable: false),
                    UidValidity = table.Column<long>(type: "bigint", nullable: false),
                    MessageId = table.Column<string>(type: "text", nullable: true),
                    InReplyTo = table.Column<string>(type: "text", nullable: true),
                    HeaderReferences = table.Column<string[]>(type: "text[]", nullable: false),
                    Subject = table.Column<string>(type: "text", nullable: true),
                    NormalizedSubject = table.Column<string>(type: "text", nullable: true),
                    FromName = table.Column<string>(type: "text", nullable: true),
                    FromAddr = table.Column<string>(type: "text", nullable: true),
                    ToAddrs = table.Column<string>(type: "text", nullable: true),
                    CcAddrs = table.Column<string>(type: "text", nullable: true),
                    MessageDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    InternalDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Snippet = table.Column<string>(type: "text", nullable: true),
                    BodyText = table.Column<string>(type: "text", nullable: true),
                    BodyHtml = table.Column<string>(type: "text", nullable: true),
                    Flags = table.Column<string[]>(type: "text[]", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    HasAttachments = table.Column<bool>(type: "boolean", nullable: false),
                    AttachmentMetaJson = table.Column<string>(type: "jsonb", nullable: true),
                    SearchVector = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "to_tsvector('english', coalesce(\"Subject\", '') || ' ' || coalesce(\"FromAddr\", '') || ' ' || coalesce(\"FromName\", '') || ' ' || coalesce(\"ToAddrs\", '') || ' ' || coalesce(\"BodyText\", ''))", stored: true),
                    FetchedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MailMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MailMessages_MailThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "MailThreads",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_MailMessages_MailboxFolders_FolderId",
                        column: x => x.FolderId,
                        principalTable: "MailboxFolders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Contacts_OrganizationId_Email",
                table: "Contacts",
                columns: new[] { "OrganizationId", "Email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MailboxFolders_MailboxConnectionId_FullName",
                table: "MailboxFolders",
                columns: new[] { "MailboxConnectionId", "FullName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_FolderId",
                table: "MailMessages",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_MailboxConnectionId_FolderId_UidValidity_Uid",
                table: "MailMessages",
                columns: new[] { "MailboxConnectionId", "FolderId", "UidValidity", "Uid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_MailboxConnectionId_MessageDate",
                table: "MailMessages",
                columns: new[] { "MailboxConnectionId", "MessageDate" });

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_MessageId",
                table: "MailMessages",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_SearchVector",
                table: "MailMessages",
                column: "SearchVector")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "IX_MailMessages_ThreadId",
                table: "MailMessages",
                column: "ThreadId");

            migrationBuilder.CreateIndex(
                name: "IX_MailThreads_MailboxConnectionId_LastDate",
                table: "MailThreads",
                columns: new[] { "MailboxConnectionId", "LastDate" });

            migrationBuilder.CreateIndex(
                name: "IX_MailThreads_MailboxConnectionId_RootKey",
                table: "MailThreads",
                columns: new[] { "MailboxConnectionId", "RootKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Contacts");

            migrationBuilder.DropTable(
                name: "MailMessages");

            migrationBuilder.DropTable(
                name: "MailThreads");

            migrationBuilder.DropTable(
                name: "MailboxFolders");

            migrationBuilder.DropColumn(
                name: "LastSyncCompletedAt",
                table: "MailboxConnections");

            migrationBuilder.DropColumn(
                name: "SyncError",
                table: "MailboxConnections");

            migrationBuilder.DropColumn(
                name: "SyncState",
                table: "MailboxConnections");
        }
    }
}
