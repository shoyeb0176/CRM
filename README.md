# Mini ERP by Inuberry

I want to build Inuberry ERP as a multi-tenant SaaS ERP platform for small and mid-sized businesses.

The product should be inspired by common ERP/CRM platforms, but it must be original. Do not copy the branding, UI, icons, wording, layouts, or proprietary workflows of Odoo, Zoho, NetSuite, QuickBooks, or any other platform.

Use Supabase as the backend. The app should be production-minded, not a prototype with fake data. Use real Supabase tables, relationships, authentication, row-level security, and seed data.

Core product goal:

Build an all-in-one ERP SaaS with modules for:

1. CRM

2. Sales

3. Customers

4. Products and Services

5. Quotes and Invoices

6. Inventory

7. Purchasing

8. Projects and Tasks

9. HR and Employees

10. Basic Accounting/Ledger

11. Reports/Dashboards

12. Admin Settings

13. SaaS Billing/Plans

Target customers:

Small businesses, contractors, agencies, shops, import/export companies, IT service companies, and field service businesses.

Important architecture requirements:

- Multi-tenant SaaS architecture

- Each company/account is a tenant

- A user can belong to multiple organizations

- Every business record must belong to an organization

- Strong role-based access control

- Supabase Auth for login/signup

- Supabase Postgres for database

- Supabase RLS for tenant isolation

- Clean, responsive dashboard UI

- No fake local-only data unless it is seed/demo data stored in Supabase

- Use TypeScript

- Use reusable components

- Use a modular architecture so each ERP module can grow independently

- Include audit logs for important actions

- Include activity timeline for customers, deals, invoices, projects, and employees

User roles:

- Platform Owner

- Organization Owner

- Organization Admin

- Manager

- Staff

- Accountant

- Sales Rep

- Inventory Manager

- HR Manager

- Read-only User

First, create a detailed product plan, technical architecture, database schema, Supabase RLS strategy, page structure, module list, component structure, and implementation phases.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://craft-core-os.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/45240b2b-37aa-466e-aa9f-1cd6bc4ea2eb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
"# CRM" 
"# CRM" 
