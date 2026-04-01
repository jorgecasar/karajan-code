---
name: dental-clinical
description: Clinical dental workflows, treatment types, and orthodontic terminology
tags:
  - dental
  - clinical
  - orthodontics
  - treatments
version: 1.0.0
author: geniova
visibility: private
sources:
  - type: manual
    note: Created by Geniova dental team based on clinical protocols
---

# Dental Clinical Domain

## Core Concepts

Teeth are numbered using the FDI World Dental Federation notation system:
- Upper right: 11-18, Upper left: 21-28
- Lower left: 31-38, Lower right: 41-48

Orthodontic treatment types:
- **Fixed appliances**: brackets, archwires, bands
- **Removable aligners**: transparent trays (e.g., Invisalign-type)
- **Mixed**: combination of fixed and removable phases

Treatment lifecycle: Diagnosis -> Planning -> Approval -> Manufacturing -> Delivery -> Follow-up

## Terminology

- **Malocclusion**: misalignment of teeth or incorrect relation between upper and lower dental arches
- **Bracket**: small attachment bonded to the tooth surface to hold the archwire
- **Archwire**: wire threaded through brackets that applies corrective force
- **Aligner**: removable transparent tray that gradually moves teeth
- **IPR (Interproximal Reduction)**: controlled removal of enamel between teeth to create space
- **Attachment**: tooth-colored bump bonded to tooth to help aligners grip
- **Overcorrection**: intentional over-movement to account for relapse tendency
- **Staging**: the sequence and timing of tooth movements across aligner steps

## Business Rules

- Treatment plans must be approved by the lead clinician before manufacturing begins.
- Maximum standard treatment duration is 36 months; extensions require clinical justification.
- Each aligner step should move teeth no more than 0.25mm or 2 degrees of rotation.
- Clinical photos and scans are mandatory at: initial diagnosis, mid-treatment, and completion.
- Patient consent form must be signed before any irreversible procedure (e.g., IPR, extractions).

## Common Edge Cases

- **Mixed dentition**: pediatric patients with both primary and permanent teeth require special staging to account for natural tooth eruption during treatment.
- **Missing teeth**: treatment plans must explicitly account for gaps, pontics, or implant spaces.
- **Previous orthodontic treatment**: relapse cases need different force protocols than first-time treatments.
- **TMJ disorders**: patients with temporomandibular joint issues may need movement limits per step.
- **Pregnancy**: treatment may need to be paused; certain procedures (radiographs) are contraindicated.
