import { getCrmConsultants } from "@/lib/crm";

export async function GET() {
  try {
    const labels = await getCrmConsultants();
    const consultants = labels.map(label => ({ label }));
    return Response.json({ consultants });
  } catch (error) {
    return Response.json({ consultants: [], error: error?.message }, { status: 500 });
  }
}
