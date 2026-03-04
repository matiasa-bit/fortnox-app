import { getCrmContactDirectory } from "@/lib/crm";
import ContactsManager from "@/app/crm/contacts/ContactsManager";

export const dynamic = "force-dynamic";

export default async function CrmContactsPage() {
  const contacts = await getCrmContactDirectory();

  return (
    <section style={{ background: "#1a2e3b", border: "1px solid #2a4a5e", borderRadius: 16, padding: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>Kontakter</h2>
      <p style={{ margin: "0 0 16px", color: "#8fb1c3", fontSize: 13 }}>
        Central kontaktlista som kan kopplas till flera kunder.
      </p>
      <ContactsManager initialContacts={contacts} />
    </section>
  );
}
