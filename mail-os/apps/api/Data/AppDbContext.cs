using Microsoft.EntityFrameworkCore;

namespace Kompanion.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<MailboxConnection> MailboxConnections => Set<MailboxConnection>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();
    public DbSet<MailboxFolder> MailboxFolders => Set<MailboxFolder>();
    public DbSet<MailThread> MailThreads => Set<MailThread>();
    public DbSet<MailMessage> MailMessages => Set<MailMessage>();
    public DbSet<MailAttachment> MailAttachments => Set<MailAttachment>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<MailDraft> MailDrafts => Set<MailDraft>();
    public DbSet<BrandKit> BrandKits => Set<BrandKit>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ThreadCompany> ThreadCompanies => Set<ThreadCompany>();
    public DbSet<ThreadProject> ThreadProjects => Set<ThreadProject>();
    public DbSet<ThreadContact> ThreadContacts => Set<ThreadContact>();
    public DbSet<ThreadAssignment> ThreadAssignments => Set<ThreadAssignment>();
    public DbSet<ThreadNote> ThreadNotes => Set<ThreadNote>();
    public DbSet<SendOperation> SendOperations => Set<SendOperation>();
    public DbSet<DraftTombstone> DraftTombstones => Set<DraftTombstone>();
    public DbSet<ProjectFlight> ProjectFlights => Set<ProjectFlight>();
    public DbSet<ThreadResponseTime> ThreadResponseTimes => Set<ThreadResponseTime>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            // Stored already-lowercased, so a plain unique index is enough — no need
            // for the expression index the display name required.
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).HasMaxLength(32);
            e.Property(u => u.DisplayName).HasMaxLength(128);
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(16);
        });

        modelBuilder.Entity<Invitation>(e =>
        {
            e.HasIndex(i => i.TokenHash).IsUnique();
            e.HasIndex(i => new { i.OrganizationId, i.Email });
            e.Property(i => i.Email).HasMaxLength(256);
            e.Property(i => i.TokenHash).HasMaxLength(64);
            e.Property(i => i.Role).HasConversion<string>().HasMaxLength(16);
            e.HasOne(i => i.CreatedBy).WithMany()
                .HasForeignKey(i => i.CreatedByUserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MailboxConnection>(e =>
        {
            e.HasIndex(m => new { m.UserId, m.Email }).IsUnique();
            e.Property(m => m.CredentialType).HasConversion<string>().HasMaxLength(32);
        });

        modelBuilder.Entity<AuditLogEntry>(e =>
        {
            e.HasIndex(a => a.CreatedAt);
            e.HasIndex(a => a.ActorUserId);
            e.Property(a => a.Action).HasMaxLength(64);
        });

        modelBuilder.Entity<MailboxConnection>(e =>
        {
            e.Property(m => m.SyncState).HasConversion<string>().HasMaxLength(16);
        });

        modelBuilder.Entity<MailboxFolder>(e =>
        {
            e.HasIndex(f => new { f.MailboxConnectionId, f.FullName }).IsUnique();
            e.Property(f => f.SpecialUse).HasConversion<string>().HasMaxLength(16);
        });

        modelBuilder.Entity<MailThread>(e =>
        {
            e.Property(t => t.ReplyState).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(t => new { t.ReplyState, t.StateSince });
            e.HasIndex(t => new { t.MailboxConnectionId, t.RootKey }).IsUnique();
            e.HasIndex(t => new { t.MailboxConnectionId, t.LastDate });
        });

        modelBuilder.Entity<MailMessage>(e =>
        {
            e.HasIndex(m => new { m.MailboxConnectionId, m.FolderId, m.UidValidity, m.Uid }).IsUnique();
            e.HasIndex(m => m.MessageId);
            e.HasIndex(m => m.ThreadId);
            e.HasIndex(m => new { m.MailboxConnectionId, m.MessageDate });
            e.Property(m => m.AttachmentMetaJson).HasColumnType("jsonb");
            e.Property(m => m.SearchVector)
                .HasComputedColumnSql(
                    "to_tsvector('english', coalesce(\"Subject\", '') || ' ' || coalesce(\"FromAddr\", '') || ' ' || coalesce(\"FromName\", '') || ' ' || coalesce(\"ToAddrs\", '') || ' ' || coalesce(\"BodyText\", ''))",
                    stored: true);
            e.HasIndex(m => m.SearchVector).HasMethod("gin");
        });

        modelBuilder.Entity<MailAttachment>(e =>
        {
            e.HasIndex(a => a.MessageId);
            e.HasIndex(a => a.DraftId);
            // Sweeping abandoned uploads needs to find staged rows by age.
            e.HasIndex(a => new { a.OwnerUserId, a.CreatedAt });
            e.Property(a => a.FileName).HasMaxLength(256);
            e.Property(a => a.ContentType).HasMaxLength(128);
            e.Property(a => a.BlobKey).HasMaxLength(64);

            e.HasOne(a => a.Message).WithMany(m => m.Attachments)
                .HasForeignKey(a => a.MessageId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.Draft).WithMany(d => d.Attachments)
                .HasForeignKey(a => a.DraftId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.Owner).WithMany()
                .HasForeignKey(a => a.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Contact>(e =>
        {
            e.HasIndex(c => new { c.OrganizationId, c.Email }).IsUnique();
        });

        modelBuilder.Entity<MailDraft>(e =>
        {
            e.HasIndex(d => d.MailboxConnectionId);
            e.Property(d => d.AttachmentMetaJson).HasColumnType("jsonb");
            e.Property(d => d.ReferencesJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<BrandKit>(e =>
        {
            e.HasIndex(b => b.OrganizationId).IsUnique();
        });

        modelBuilder.Entity<EmailTemplate>(e =>
        {
            e.HasIndex(t => t.OrganizationId);
            e.Property(t => t.VariablesJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<Company>(e =>
        {
            e.HasIndex(c => new { c.OrganizationId, c.Name }).IsUnique();
            e.HasIndex(c => new { c.OrganizationId, c.Domain });
        });

        modelBuilder.Entity<Project>(e =>
        {
            e.HasIndex(p => new { p.CompanyId, p.Name }).IsUnique();
        });

        modelBuilder.Entity<ProjectFlight>(e =>
        {
            e.Property(f => f.SiteName).HasMaxLength(200);
            e.HasIndex(f => new { f.ProjectId, f.StartDate });
            e.HasIndex(f => f.StartDate);
            e.ToTable(t => t.HasCheckConstraint("CK_ProjectFlights_Dates", "\"EndDate\" >= \"StartDate\""));
        });

        modelBuilder.Entity<ThreadResponseTime>(e =>
        {
            e.HasIndex(r => r.SendOperationId).IsUnique();
            e.HasIndex(r => new { r.MailboxConnectionId, r.InboundMessageKey }).IsUnique();
            e.HasIndex(r => r.SentAt);
            e.HasOne(r => r.Thread).WithMany().HasForeignKey(r => r.ThreadId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(r => r.Company).WithMany().HasForeignKey(r => r.CompanyId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
            e.ToTable(t => t.HasCheckConstraint("CK_ThreadResponseTimes_Seconds", "\"Seconds\" >= 0"));
        });

        modelBuilder.Entity<ThreadCompany>(e =>
        {
            e.HasKey(t => new { t.ThreadId, t.CompanyId });
            e.HasOne(t => t.Thread).WithMany().HasForeignKey(t => t.ThreadId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Company).WithMany().HasForeignKey(t => t.CompanyId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ThreadProject>(e =>
        {
            e.HasKey(t => new { t.ThreadId, t.ProjectId });
            e.HasOne(t => t.Thread).WithMany().HasForeignKey(t => t.ThreadId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Project).WithMany().HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ThreadContact>(e =>
        {
            e.HasKey(t => new { t.ThreadId, t.ContactId });
            e.HasOne(t => t.Thread).WithMany().HasForeignKey(t => t.ThreadId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(t => t.Contact).WithMany().HasForeignKey(t => t.ContactId).OnDelete(DeleteBehavior.Cascade);
        });

        // One assignment per thread — re-assigning replaces the previous one.
        modelBuilder.Entity<ThreadAssignment>(e =>
        {
            e.HasKey(a => a.ThreadId);
            e.HasOne(a => a.Thread).WithMany().HasForeignKey(a => a.ThreadId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(a => a.AssignedBy).WithMany().HasForeignKey(a => a.AssignedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ThreadNote>(e =>
        {
            e.HasIndex(n => n.ThreadId);
            e.HasOne(n => n.Thread).WithMany().HasForeignKey(n => n.ThreadId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(n => n.Author).WithMany().HasForeignKey(n => n.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        });

        // One operation per (request key, caller, mailbox): concurrent duplicates
        // collide here instead of delivering twice.
        modelBuilder.Entity<SendOperation>(e =>
        {
            e.HasIndex(o => new { o.RequestKey, o.CallerUserId, o.MailboxConnectionId }).IsUnique();
            e.HasIndex(o => o.MailboxConnectionId);
            e.Property(o => o.RequestKey).HasMaxLength(128);
            e.Property(o => o.PayloadHash).HasMaxLength(64);
            e.Property(o => o.WireMessageId).HasMaxLength(256);
            e.Property(o => o.Status).HasConversion<string>().HasMaxLength(16);
            e.HasOne(o => o.Caller).WithMany().HasForeignKey(o => o.CallerUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(o => o.MailboxConnection).WithMany().HasForeignKey(o => o.MailboxConnectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DraftTombstone>(e =>
        {
            e.HasKey(t => t.DraftId);
            e.HasIndex(t => t.MailboxConnectionId);
            e.Property(t => t.Reason).HasMaxLength(16);
        });

        modelBuilder.Entity<MailDraft>(e =>
        {
            e.Property(d => d.RowVersion).IsRowVersion();
        });
    }
}
