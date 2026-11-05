import type { Metadata } from "next";
import { SpecEditor } from "@/components/spec/spec-editor";
import { requireStaff } from "@/lib/auth/current-user";
import { getSource } from "@/lib/source";

export const metadata: Metadata = { title: "New API" };

const TEMPLATE = `openapi: 3.1.0
info:
  title: My API
  version: 0.1.0
  description: What this API is for, in one or two sentences.
  contact:
    name: Owning team
    email: team@example.com
servers:
  - url: https://sandbox.api.example.com/v1
tags:
  - name: Items
paths:
  /items:
    get:
      operationId: listItems
      summary: List items
      description: Newest first.
      tags: [Items]
      responses:
        "200":
          description: A page of items.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Item"
components:
  schemas:
    Item:
      type: object
      required: [id]
      properties:
        id: { type: string, example: itm_1 }
        name: { type: string, example: Widget }
`;

export default async function NewApiPage() {
  await requireStaff("designer");
  const source = getSource();
  return <SpecEditor slug="" initial={TEMPLATE} isNew sourceLabel={`new folder on ${source.defaultBranch}`} sourceKind={source.kind} />;
}
