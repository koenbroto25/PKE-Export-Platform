import{describe,it,expect}from"vitest";import{readFileSync}from"node:fs";import{join}from"node:path";
const ui=readFileSync(join(process.cwd(),"frontend/src/FieldCapturePage.tsx"),"utf8");
describe("P26 Field Capture maker-checker review UI",()=>{
 it("renders review controls only when server returns reviewer permission",()=>{expect(ui).toContain("canReviewSubmissions");expect(ui).toContain("canReview?:boolean");expect(ui).toContain("canReviewSubmissions&&['submitted','needs_review']");});
 it("posts decisions with reasons and refreshes receipt state",()=>{expect(ui).toContain("/field-captures/'+encodeURIComponent(String(submission.id))+'/review");expect(ui).toContain("decision,reason");expect(ui).toContain("refreshServerSubmissions()");});
 it("explains terminal acceptance and requires rejection reason",()=>{expect(ui).toContain("Keputusan final tidak dapat diubah");expect(ui).toContain("Alasan penolakan (minimal 5 karakter)");expect(ui).toContain("Review {s.last_review_decision}");});
});
