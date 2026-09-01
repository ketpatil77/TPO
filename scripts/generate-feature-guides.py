from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

OUT = Path(__file__).resolve().parents[1] / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)

GREEN = colors.HexColor("#1F5B49")
COPPER = colors.HexColor("#A65E36")
INK = colors.HexColor("#17212B")
MUTED = colors.HexColor("#52606D")
PAPER = colors.HexColor("#F7F3EA")
LINE = colors.HexColor("#D7D0C3")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=INK, alignment=TA_CENTER, spaceAfter=5))
styles.add(ParagraphStyle(name="GuideSub", parent=styles["Normal"], fontSize=9.2, leading=13, textColor=MUTED, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=GREEN, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="Feature", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceAfter=3))
styles.add(ParagraphStyle(name="BodyGuide", parent=styles["BodyText"], fontSize=8.7, leading=12.4, textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=8.2, leading=11.5, textColor=MUTED, leftIndent=8, borderColor=LINE, borderWidth=0.7, borderPadding=6, backColor=PAPER, spaceBefore=3, spaceAfter=6))

def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(GREEN)
    canvas.rect(0, h - 8*mm, w, 8*mm, fill=1, stroke=0)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18*mm, 11*mm, "AIT Placement Portal - Role Feature Guide")
    canvas.drawRightString(w - 18*mm, 11*mm, f"Page {doc.page}")
    canvas.restoreState()

def feature(title, text):
    return Paragraph(f"<b>{title}</b><br/>{text}", styles["BodyGuide"])

def make_guide(filename, audience, subtitle, sections, quick_steps, safety):
    story = [Spacer(1, 5*mm), Paragraph("AIT Placement Portal", styles["GuideTitle"]), Paragraph(f"{audience} Feature Guide", styles["GuideTitle"]), Paragraph(subtitle + "<br/><b>Updated 14 August 2026</b>", styles["GuideSub"])]
    data = [[Paragraph("Quick start", styles["Feature"]), Paragraph("What this portal gives you", styles["Feature"])] , [Paragraph("<br/>".join(f"{i+1}. {s}" for i,s in enumerate(quick_steps)), styles["BodyGuide"]), Paragraph(sections[0][1][0][1], styles["BodyGuide"])]]
    t = Table(data, colWidths=[78*mm, 78*mm], hAlign="CENTER")
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),GREEN),("TEXTCOLOR",(0,0),(-1,0),colors.white),("BOX",(0,0),(-1,-1),0.8,LINE),("INNERGRID",(0,0),(-1,-1),0.5,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
    story += [t, Spacer(1, 3*mm)]
    for heading, items in sections:
        story.append(Paragraph(heading, styles["Section"]))
        for title, text in items:
            story.append(feature(title, text))
    story += [Paragraph("Security and responsible use", styles["Section"]), Paragraph(safety, styles["Note"]), Paragraph("Support", styles["Section"]), Paragraph('On login page, select <b>Contact Him</b>. Gmail opens a prepared login-help draft addressed to <b>ket.patil77@gmail.com</b>. Add your PRN or staff email and explain the problem. Never send your password or date of birth password.', styles["BodyGuide"])]
    doc = SimpleDocTemplate(str(OUT / filename), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm, title=f"AIT {audience} Feature Guide", author="AIT Placement Portal")
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

student_sections = [
    ("Your placement workspace", [("Placement profile", "Maintain academic details, semester CGPA, activities, skills, internships, certificates, projects, diploma data, resume, and profile picture."),("Resume skill assistant", "Choose a text-based PDF and select Detect skills from resume. Review ranked suggestions, add only accurate matches, edit manually if needed, then save the profile."),("Profile readiness", "See completion percentage, missing fields, resume quality, and correction requests. Complete required data before applying."),("Opportunities", "View only published placement drives. Eligibility explains matched criteria, missing requirements, and available application action."),("Applications and outcomes", "Track applied, eligible, test, interview, selected, rejected, or withdrawn stages, plus scheduled interviews and offers."),("Notification inbox", "Use dashboard bell to read alerts, mark one or all as read, and open safe portal destinations without losing login."),("Documents", "Upload a private PDF resume up to 2 MB. Only authorized roles can access it.")]),
    ("Recommended student routine", [("Before placement season", "Verify PRN, branch, class, year, CGPA, resume, skills, and experience."),("During active drives", "Check notifications daily, review eligibility reasons, apply before deadline, and respond to corrections."),("After selection stages", "Keep interview and offer status current through Training and Placement Cell instructions.")])]

admin_sections = [
    ("Placement operations", [("Student and roster management", "Filter profiles, export data, import up to 10,000 rows per 10 MB file, preview errors, review history, and undo a batch."),("Data readiness", "Find missing profiles, incomplete fields, missing resumes, and open correction requests."),("Placement drives", "Set branches, CGPA, and skills; rank candidates; review, publish, close, export, or delete drives."),("Applications and alerts", "Manage application stages and alerts, including audience, expiry, delivery, read totals, history, and deletion."),("Advanced operations", "Search students, save filters, record assessments, schedule interviews, track offers, and maintain the calendar."),("Reports and audit", "Export student CSV/XLSX, management reports, printable PDF, audit CSV, and login/access workbook.")]),
    ("Super Admin controls", [("Staff accounts", "Create Admin or TPC accounts, assign departments, disable access, reset passwords, and revoke sessions."),("Security intelligence", "Review health, failed logins, duplicate identities, fraud indicators, and audit activity."),("Launch readiness", "Run the checklist, create backups, restore confirmed backups, and verify communications."),("Deadline reminders", "Refreshing launch checks creates alerts for open drives due within 48 hours.")])]

observer_sections = [
    ("Read-only placement oversight", [("College-wide overview", "View branch totals and placement readiness across AIML, CT, EE, ME, CE, and E&C."),("Student readiness", "Review profile completion, academic data, resume availability, skills, internships, certificates, projects, and placement preparation without editing records."),("Placement activity", "View drives, eligibility information, applications, interviews, offers, and reports available to observer role."),("Correction requests", "Open a student record and submit a checked correction request. The request alerts authorized staff without giving TPC direct edit access."),("Protected boundaries", "TPC cannot upload rosters, edit students directly, create drives, change applications, send notices, manage staff, or restore backups.")]),
    ("Recommended observer routine", [("Weekly review", "Check missing profiles, resume readiness, active drives, and application pipeline."),("Escalation", "Use correction requests for record problems and contact an Admin for access issues. Never request student passwords."),("Reports", "Use read-only reporting surfaces for department coordination and management review.")])]

make_guide("AIT-Student-Feature-Guide.pdf", "Student", "Practical guide for students using profile, opportunities, applications, notifications, interviews, and offers.", student_sections, ["Open portal and choose Student.", "Enter PRN and six-digit DOB password.", "Complete profile before applying.", "Check bell and opportunities regularly."], "Use only your own account. Keep DOB password private. Upload genuine documents. Do not share resume links or screenshots containing student data.")
make_guide("AIT-Admin-Feature-Guide.pdf", "Admin", "Operational guide for roster, students, drives, communications, reports, security, and launch control.", admin_sections, ["Choose Admin and sign in with assigned email.", "Upload and validate roster.", "Review readiness before publishing drives.", "Use audit, backup, and reports before major changes."], "Admin actions affect many students. Preview imports, create backups before large changes, verify audience and expiry before sending alerts, and never export data to unauthorized recipients.")
make_guide("AIT-TPC-Observer-Feature-Guide.pdf", "TPC Observer", "Read-only guide for placement readiness, oversight, and department coordination.", observer_sections, ["Choose TPC on login page.", "Sign in with assigned observer email.", "Review college-wide readiness and activity.", "Escalate corrections to authorized Admin."], "Observer access is read-only. Do not attempt student edits or share private placement data. Use reports only for authorized institutional work.")

print("\n".join(str(OUT / name) for name in ("AIT-Student-Feature-Guide.pdf", "AIT-Admin-Feature-Guide.pdf", "AIT-TPC-Observer-Feature-Guide.pdf")))
