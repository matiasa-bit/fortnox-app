import { getCrmContactDirectory } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function CrmContactsPage() {
  const contacts = await getCrmContactDirectory();

  return (
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 16, padding: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>Kontakter</h2>
      <p style={{ margin: "0 0 16px", color: "#8fb1c3", fontSize: 13 }}>
        Central kontaktlista som kan kopplas till flera kunder.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a4a5e" }}>
              {["Namn", "Roll", "E-post", "Telefon"].map(h => (
                <th key={h} style={{ textAlign: "left", color: "#6b8fa3", fontSize: 12, fontWeight: 600, padding: "0 10px 12px 0", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map(contact => (
              <tr key={contact.id} style={{ borderBottom: "1px solid #1e3545" }}>
                <td style={{ padding: "10px 10px 10px 0", color: "#fff", fontWeight: 600, fontSize: 13 }}>{contact.name || "-"}</td>
                <td style={{ padding: "10px 10px 10px 0", color: "#dbe7ef", fontSize: 13 }}>{contact.role || "-"}</td>
                <td style={{ padding: "10px 10px 10px 0", color: "#dbe7ef", fontSize: 13 }}>{contact.email || "-"}</td>
                <td style={{ padding: "10px 10px 10px 0", color: "#dbe7ef", fontSize: 13 }}>{contact.phone || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contacts.length === 0 && (
        <p style={{ marginTop: 12, color: "#8fb1c3", fontSize: 13 }}>Inga kontakter hittades.</p>
      )}
    </section>
  );
}
