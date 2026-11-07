namespace Kompanion.Api.Services.Mail;

/// <summary>
/// The template library an organisation starts with.
///
/// These are body fragments, not whole documents, for two reasons. The composer
/// drops a template's HTML straight into a contenteditable editor, which would
/// mangle a &lt;head&gt; or a &lt;style&gt; block; and sending wraps the body in the brand
/// kit either way (see MailComposer), so a template carrying its own logo header
/// and address footer would go out with both sets. The kit supplies the outer
/// chrome; these supply the designed content inside it.
///
/// Everything is inline-styled table markup. Mail clients strip stylesheets, and
/// the Word rendering engine behind desktop Outlook ignores border-radius and
/// gradients — so every gradient sits on top of a background-color that carries
/// the design on its own, and rounded corners degrade to square rather than to
/// broken.
///
/// The six repeat a lot of markup instead of sharing builders. That is deliberate:
/// these are content, and a designer changing one of them should be able to read
/// it end to end in one piece rather than tracing it through helpers.
/// </summary>
public static class StarterTemplates
{
    public sealed record Definition(
        string Name,
        string Description,
        string Subject,
        string BodyHtml,
        string[] Variables,
        /// <summary>
        /// True for a template that carries its own letterhead and footer, and so is
        /// sent without the brand kit's chrome around it.
        /// </summary>
        bool SkipBrandWrap = false);

    public static IReadOnlyList<Definition> All { get; } =
    [
        ProjectUpdate,
        Proposal,
        CampaignResults,
        Welcome,
        Invoice,
        CreativeReview,
        Announcement,
    ];

    // ---------------------------------------------------------------- 1 of 6

    private static Definition ProjectUpdate => new(
        "Project update",
        "Weekly status on a live project, with what moved and what is next.",
        "{{project_name}} — this week's progress",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#0E0E0E;background-image:radial-gradient(120% 92% at 50% 122%, #F9ED32 0%, #FBB040 24%, rgba(251,176,64,0.20) 50%, rgba(14,14,14,0) 74%);padding:38px 32px 44px;text-align:center;">
                <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FBB040;">Project update</p>
                <p style="margin:0;font-size:30px;line-height:1.14;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:-0.6px;color:#FFFFFF;">{{project_name}}</p>
                <p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.60);">This week in review &middot; prepared by {{sender_name}}</p>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:30px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.62;color:#3A3A3A;">Here is where <strong style="color:#171717;">{{project_name}}</strong> stands. Everything below is ready for your eyes — shout if anything looks off.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="26" valign="top" style="padding:0 0 16px;"><div style="width:9px;height:9px;border-radius:9px;background-color:#FBB040;margin-top:6px;"></div></td>
                    <td valign="top" style="padding:0 0 16px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Shipped this week</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">First cut of the hero film, three key visuals and the copy deck.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="26" valign="top" style="padding:0 0 16px;"><div style="width:9px;height:9px;border-radius:9px;background-color:#FBB040;margin-top:6px;"></div></td>
                    <td valign="top" style="padding:0 0 16px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">In progress</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Sound design and the cutdowns for social. With the studio now.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="26" valign="top" style="padding:0;"><div style="width:9px;height:9px;border-radius:9px;background-color:#D9D9D9;margin-top:6px;"></div></td>
                    <td valign="top" style="padding:0;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Needs you</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Sign-off on the hero cut so we can lock the edit and book the mix.</p>
                    </td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#EFEFEF;margin:26px 0;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#FBB040;background-image:linear-gradient(180deg,#F9ED32 0%,#FBB040 100%);">
                    <a href="{{review_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#171717;text-decoration:none;border-radius:999px;">Review the latest cut &rarr;</a>
                  </td>
                </tr></table>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "project_name", "sender_name", "review_link"]);

    // ---------------------------------------------------------------- 2 of 6

    private static Definition Proposal => new(
        "Proposal sent",
        "Sends a costed proposal, leading with the number and what it buys.",
        "Your proposal for {{project_name}}",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#0E0E0E;background-image:radial-gradient(110% 100% at 100% 0%, rgba(249,237,50,0.30) 0%, rgba(251,176,64,0.16) 34%, rgba(14,14,14,0) 66%);padding:36px 32px 38px;">
                <p style="margin:0 0 18px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FBB040;">Proposal &middot; {{project_name}}</p>
                <p style="margin:0;font-size:44px;line-height:1;font-weight:800;font-style:italic;letter-spacing:-1.4px;color:#F9ED32;">{{total_amount}}</p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.62);">All-in, no surprises. Valid until {{due_date}}.</p>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:30px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.62;color:#3A3A3A;">Thanks for the brief — we enjoyed it. Here is what the number covers.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="38" valign="top" style="padding:0 0 18px;"><p style="margin:0;font-size:20px;font-weight:800;font-style:italic;color:#FBB040;line-height:1;">01</p></td>
                    <td valign="top" style="padding:0 0 18px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Strategy &amp; concept</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Positioning, the big idea, and two routes to choose between.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="38" valign="top" style="padding:0 0 18px;"><p style="margin:0;font-size:20px;font-weight:800;font-style:italic;color:#FBB040;line-height:1;">02</p></td>
                    <td valign="top" style="padding:0 0 18px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Production</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Shoot, edit, grade and sound — delivered in every format you need.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="38" valign="top" style="padding:0;"><p style="margin:0;font-size:20px;font-weight:800;font-style:italic;color:#FBB040;line-height:1;">03</p></td>
                    <td valign="top" style="padding:0;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Launch support</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Media-ready cutdowns and a fortnight of optimisation after go-live.</p>
                    </td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#EFEFEF;margin:26px 0;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#FBB040;background-image:linear-gradient(180deg,#F9ED32 0%,#FBB040 100%);">
                    <a href="{{proposal_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#171717;text-decoration:none;border-radius:999px;">Read the full proposal &rarr;</a>
                  </td>
                </tr></table>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#8A8A8A;">Want to talk it through first? Reply here and we will find a slot this week.</p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "project_name", "total_amount", "due_date", "proposal_link"]);

    // ---------------------------------------------------------------- 3 of 6

    private static Definition CampaignResults => new(
        "Campaign results",
        "End-of-flight performance report, led by the headline numbers.",
        "{{campaign_name}} — the numbers",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#0E0E0E;background-image:radial-gradient(100% 120% at 0% 100%, #FBB040 0%, rgba(251,176,64,0.28) 30%, rgba(14,14,14,0) 62%);padding:38px 32px 42px;">
                <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FBB040;">Campaign results</p>
                <p style="margin:0;font-size:30px;line-height:1.14;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:-0.6px;color:#FFFFFF;">{{campaign_name}}</p>
                <p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.60);">Flight period &middot; {{campaign_period}}</p>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:28px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.62;color:#3A3A3A;">The flight is done and the numbers are in. Headlines first.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="33%" valign="top" style="padding:0 6px 0 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="background-color:#FFF9EE;border:1px solid #F5E2C2;border-radius:12px;padding:16px 12px;text-align:center;">
                        <p style="margin:0 0 5px;font-size:21px;font-weight:800;color:#171717;letter-spacing:-0.4px;">{{impressions}}</p>
                        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9A7A45;">Impressions</p>
                      </td></tr></table>
                    </td>
                    <td width="33%" valign="top" style="padding:0 3px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="background-color:#FFF9EE;border:1px solid #F5E2C2;border-radius:12px;padding:16px 12px;text-align:center;">
                        <p style="margin:0 0 5px;font-size:21px;font-weight:800;color:#171717;letter-spacing:-0.4px;">{{clicks}}</p>
                        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9A7A45;">Clicks</p>
                      </td></tr></table>
                    </td>
                    <td width="33%" valign="top" style="padding:0 0 0 6px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td style="background-color:#FFF9EE;border:1px solid #F5E2C2;border-radius:12px;padding:16px 12px;text-align:center;">
                        <p style="margin:0 0 5px;font-size:21px;font-weight:800;color:#171717;letter-spacing:-0.4px;">{{ctr}}</p>
                        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9A7A45;">Click rate</p>
                      </td></tr></table>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:12px;"><tr>
                  <td style="background-color:#171717;border-radius:12px;padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td valign="middle"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#FBB040;">Conversions</p></td>
                      <td valign="middle" align="right"><p style="margin:0;font-size:24px;font-weight:800;font-style:italic;color:#FFFFFF;letter-spacing:-0.5px;">{{conversions}}</p></td>
                    </tr></table>
                  </td>
                </tr></table>

                <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#5C5C5C;">The full report breaks this down by placement, creative and daypart, with what we would change next time.</p>

                <div style="height:1px;background-color:#EFEFEF;margin:24px 0;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#FBB040;background-image:linear-gradient(180deg,#F9ED32 0%,#FBB040 100%);">
                    <a href="{{report_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#171717;text-decoration:none;border-radius:999px;">See the full report &rarr;</a>
                  </td>
                </tr></table>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "campaign_name", "campaign_period", "impressions", "clicks", "ctr", "conversions", "report_link"]);

    // ---------------------------------------------------------------- 4 of 6

    private static Definition Welcome => new(
        "Welcome & kickoff",
        "Onboards a new client and books the kickoff. Amber hero, dark type.",
        "Welcome aboard, {{client_name}}",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#FBB040;background-image:linear-gradient(135deg,#F9ED32 0%,#FBB040 52%,#F0951A 100%);padding:40px 32px 44px;text-align:center;">
                <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:rgba(23,23,23,0.62);">Welcome aboard</p>
                <p style="margin:0;font-size:32px;line-height:1.1;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:-0.8px;color:#171717;">Let's make something<br>worth watching</p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:rgba(23,23,23,0.66);">{{client_name}} &times; Kwetu Connect Ads</p>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:30px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.62;color:#3A3A3A;">Delighted to have you with us. I am {{sender_name}}, and I will be your point of contact from here on. Three things happen next.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="42" valign="top" style="padding:0 0 18px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" style="background-color:#171717;border-radius:28px;font-size:12px;font-weight:800;color:#FBB040;">1</td></tr></table>
                    </td>
                    <td valign="top" style="padding:0 0 18px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">Kickoff call</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Forty-five minutes on your goals, your audience and what success looks like.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="42" valign="top" style="padding:0 0 18px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" style="background-color:#171717;border-radius:28px;font-size:12px;font-weight:800;color:#FBB040;">2</td></tr></table>
                    </td>
                    <td valign="top" style="padding:0 0 18px;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">The brief, written down</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">We send back one page you can approve, so nobody is guessing later.</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="42" valign="top" style="padding:0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" style="background-color:#171717;border-radius:28px;font-size:12px;font-weight:800;color:#FBB040;">3</td></tr></table>
                    </td>
                    <td valign="top" style="padding:0;">
                      <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#171717;">First work in your inbox</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#5C5C5C;">Two routes to react to, inside two weeks of sign-off.</p>
                    </td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#EFEFEF;margin:26px 0;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#171717;">
                    <a href="{{kickoff_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#F9ED32;text-decoration:none;border-radius:999px;">Book your kickoff call &rarr;</a>
                  </td>
                </tr></table>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "sender_name", "kickoff_link"]);

    // ---------------------------------------------------------------- 5 of 6

    private static Definition Invoice => new(
        "Invoice due",
        "A payable invoice: amount, due date and a single pay action.",
        "Invoice {{invoice_number}} — {{total_amount}} due {{due_date}}",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#0E0E0E;background-image:radial-gradient(90% 130% at 50% 0%, rgba(251,176,64,0.26) 0%, rgba(14,14,14,0) 58%);padding:34px 32px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="top">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FBB040;">Invoice {{invoice_number}}</p>
                    <p style="margin:0;font-size:38px;line-height:1;font-weight:800;font-style:italic;letter-spacing:-1.2px;color:#FFFFFF;">{{total_amount}}</p>
                  </td>
                  <td valign="top" align="right">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px solid rgba(251,176,64,0.45);border-radius:999px;padding:7px 14px;">
                      <span style="font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#FBB040;">Due {{due_date}}</span>
                    </td></tr></table>
                  </td>
                </tr></table>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:28px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.62;color:#3A3A3A;">Here is the invoice for <strong style="color:#171717;">{{project_name}}</strong>. The breakdown is below and the full document is attached.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;color:#7A7A7A;">Invoice number</td>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;font-weight:700;color:#171717;" align="right">{{invoice_number}}</td>
                  </tr>
                  <tr>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;color:#7A7A7A;">Project</td>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;font-weight:700;color:#171717;" align="right">{{project_name}}</td>
                  </tr>
                  <tr>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;color:#7A7A7A;">Payment due</td>
                    <td style="padding:11px 0;border-bottom:1px dashed #E4E4E4;font-size:14px;font-weight:700;color:#171717;" align="right">{{due_date}}</td>
                  </tr>
                  <tr>
                    <td style="padding:16px 0 0;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#171717;">Total due</td>
                    <td style="padding:16px 0 0;font-size:24px;font-weight:800;font-style:italic;color:#171717;letter-spacing:-0.5px;" align="right">{{total_amount}}</td>
                  </tr>
                </table>

                <div style="height:1px;background-color:#EFEFEF;margin:26px 0;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#FBB040;background-image:linear-gradient(180deg,#F9ED32 0%,#FBB040 100%);">
                    <a href="{{payment_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#171717;text-decoration:none;border-radius:999px;">Pay this invoice &rarr;</a>
                  </td>
                </tr></table>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#8A8A8A;">Prefer a bank transfer or M-Pesa? Reply and we will send the details. Already paid? Ignore this note, and thank you.</p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "project_name", "invoice_number", "total_amount", "due_date", "payment_link"]);

    // ---------------------------------------------------------------- 6 of 6

    private static Definition CreativeReview => new(
        "Creative review invite",
        "Invites the client to a review session, with time, place and agenda.",
        "Creative review for {{project_name}} — {{meeting_date}}",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td style="padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid #ECECEC;">

              <tr><td style="background-color:#0E0E0E;background-image:radial-gradient(130% 100% at 50% 118%, #FBB040 0%, rgba(251,176,64,0.22) 34%, rgba(14,14,14,0) 68%);padding:36px 32px 38px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#FBB040;">You're invited</p>
                <p style="margin:0 0 20px;font-size:28px;line-height:1.16;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:-0.6px;color:#FFFFFF;">Creative review<br>{{project_name}}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="background-color:rgba(255,255,255,0.08);border:1px solid rgba(251,176,64,0.40);border-radius:10px;padding:10px 14px;">
                    <p style="margin:0 0 2px;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#FBB040;">Date</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:#FFFFFF;">{{meeting_date}}</p>
                  </td>
                  <td width="10"></td>
                  <td style="background-color:rgba(255,255,255,0.08);border:1px solid rgba(251,176,64,0.40);border-radius:10px;padding:10px 14px;">
                    <p style="margin:0 0 2px;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#FBB040;">Time</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:#FFFFFF;">{{meeting_time}}</p>
                  </td>
                </tr></table>
              </td></tr>

              <tr><td style="background-color:#FFFFFF;padding:28px 32px 34px;">
                <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:#171717;">Hi {{client_name}},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.62;color:#3A3A3A;">We are ready to walk you through the work. Bring whoever needs to see it — decisions are easier with the room in one place.</p>

                <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#9A7A45;">On the agenda</p>
                <!-- One row, declared once and repeated per agenda item. It used to be
                     three hand-written rows where the last carried different padding
                     from the other two, so the spacing depended on position and adding
                     a fourth item meant editing markup. Every row now has the same
                     trailing 12px, and the rule below absorbs it in its top margin. -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  {{#each agenda_items}}
                  <tr>
                    <td width="22" valign="top" style="padding:0 0 12px;"><div style="width:6px;height:6px;border-radius:6px;background-color:#FBB040;margin-top:7px;"></div></td>
                    <td valign="top" style="padding:0 0 12px;font-size:14px;line-height:1.55;color:#3A3A3A;">{{item}}</td>
                  </tr>
                  {{/each}}
                </table>

                <div style="height:1px;background-color:#EFEFEF;margin:14px 0 26px;"></div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="border-radius:999px;background-color:#FBB040;background-image:linear-gradient(180deg,#F9ED32 0%,#FBB040 100%);">
                    <a href="{{meeting_link}}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:800;color:#171717;text-decoration:none;border-radius:999px;">Join the review &rarr;</a>
                  </td>
                </tr></table>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#8A8A8A;">Time not working? Reply with two slots that do and we will move it.</p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        // agenda_items is a list rather than a placeholder: it is declared by the
        // {{#each}} block in the body, so it is not repeated here.
        ["client_name", "project_name", "meeting_date", "meeting_time", "meeting_link"]);

    // ---------------------------------------------------------------- 7 of 7

    /// <summary>
    /// The full-bleed announcement. Unlike the other six this one is dark to every
    /// edge and carries its own wordmark and footer, so it is sent without the brand
    /// kit — <see cref="Definition.SkipBrandWrap"/> — which is what keeps it from
    /// going out with two letterheads and two sign-offs.
    /// </summary>
    private static Definition Announcement => new(
        "Announcement",
        "Full-bleed dark announcement for account news. Carries its own branding.",
        "{{campaign_name}} is paused — nothing further will spend",
        """
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B0B" style="border-collapse:collapse;background-color:#0B0B0B;">
          <tr><td align="center" style="padding:0;">
            <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:640px;">

              <tr><td align="center" style="padding:34px 24px 12px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
                  <td width="30" height="30" align="center" valign="middle" style="width:30px;height:30px;background-color:#FBB040;border-radius:9px;font-size:15px;font-weight:800;font-style:italic;line-height:30px;color:#171717;">K</td>
                  <td style="padding-left:10px;font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF;">Kwetu Connect Ads</td>
                </tr></table>
              </td></tr>

              <tr><td align="center" style="padding:26px 26px 56px;background-color:#0B0B0B;background-image:radial-gradient(75% 130% at 50% 100%, #F9ED32 0%, #FBB040 16%, rgba(251,176,64,0.34) 33%, rgba(11,11,11,0) 63%);">
                <p style="margin:0;font-size:29px;line-height:1.2;font-weight:800;font-style:italic;text-transform:uppercase;letter-spacing:-0.4px;color:#FFFFFF;">Campaign paused<br>&ndash; nothing further will spend</p>
                <p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.58);">No further delivery &middot; your creative is saved</p>
              </td></tr>

              <tr><td style="padding:0 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
                  <td style="background-color:#151515;border-radius:18px;padding:28px 26px 30px;">
                    <p style="margin:0 0 16px;font-size:19px;font-weight:700;color:#FFFFFF;">Hi {{client_name}},</p>
                    <p style="margin:0 0 20px;font-size:15px;line-height:1.62;color:#C4C4C4;">Your {{campaign_name}} flight reached the end of its approved budget, and we could not confirm the next tranche in time. So we have done the safe thing:</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="22" valign="top" style="padding:0 0 14px;"><div style="width:6px;height:6px;border-radius:6px;background-color:#FBB040;margin-top:8px;"></div></td>
                        <td valign="top" style="padding:0 0 14px;font-size:15px;line-height:1.6;color:#C4C4C4;">
                          <strong style="color:#FFFFFF;">Delivery is paused.</strong> Nothing further will serve and nothing further will be billed. Spend to date stands at {{spend_to_date}}.
                        </td>
                      </tr>
                      <tr>
                        <td width="22" valign="top" style="padding:0;"><div style="width:6px;height:6px;border-radius:6px;background-color:#FBB040;margin-top:8px;"></div></td>
                        <td valign="top" style="padding:0;font-size:15px;line-height:1.6;color:#C4C4C4;">
                          <strong style="color:#FFFFFF;">Your creative is saved.</strong> Every asset, audience and placement stays exactly as it is, ready to relaunch the day you say go.
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:26px;"><tr>
                      <td align="center" style="background-color:#3B2B0C;background-image:linear-gradient(180deg,#43310D 0%,#33250A 100%);border-radius:12px;">
                        <a href="{{options_link}}" style="display:block;padding:16px 24px;font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none;border-radius:12px;">See your options</a>
                      </td>
                    </tr></table>
                  </td>
                </tr></table>
              </td></tr>

              <tr><td align="center" style="padding:34px 26px 12px;">
                <p style="margin:0;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.42);">Follow for campaign teardowns, tips and the occasional behind-the-scenes.</p>
              </td></tr>

              <tr><td align="center" style="padding:4px 26px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
                  <td width="34" height="30" align="center" valign="middle" style="width:34px;height:30px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;font-size:10px;font-weight:700;letter-spacing:0.6px;color:rgba(255,255,255,0.60);">IG</td>
                  <td width="8"></td>
                  <td width="34" height="30" align="center" valign="middle" style="width:34px;height:30px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;font-size:10px;font-weight:700;letter-spacing:0.6px;color:rgba(255,255,255,0.60);">YT</td>
                  <td width="8"></td>
                  <td width="34" height="30" align="center" valign="middle" style="width:34px;height:30px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;font-size:10px;font-weight:700;letter-spacing:0.6px;color:rgba(255,255,255,0.60);">X</td>
                  <td width="8"></td>
                  <td width="34" height="30" align="center" valign="middle" style="width:34px;height:30px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;font-size:10px;font-weight:700;letter-spacing:0.6px;color:rgba(255,255,255,0.60);">IN</td>
                  <td width="8"></td>
                  <td width="34" height="30" align="center" valign="middle" style="width:34px;height:30px;border:1px solid rgba(255,255,255,0.16);border-radius:8px;font-size:10px;font-weight:700;letter-spacing:0.6px;color:rgba(255,255,255,0.60);">TT</td>
                </tr></table>
              </td></tr>

              <tr><td align="center" style="padding:0 26px 40px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.34);">Kwetu Connect Ads &middot; <span style="color:rgba(251,176,64,0.72);">Kilimani, Nairobi, Kenya</span> &middot; <span style="color:rgba(255,255,255,0.44);">Unsubscribe</span></p>
              </td></tr>

            </table>
          </td></tr>
        </table>
        """,
        ["client_name", "campaign_name", "spend_to_date", "options_link"],
        SkipBrandWrap: true);
}
