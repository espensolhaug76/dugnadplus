# dugnadplus
Dugnad+ enklere organisering av dugnader

# Project Brief: Dugnad+
Dugnad+ App 
Project Goal:
The primary goal is to build a simple mobile application or web app that helps a community or team organize and manage "dugnad" events. The App is in Norwegian. 
AI dev team Roles:
Product Owner: I am the product owner. My role is to define the requirements and priorities, approve features, and test the user experience.
AI Project Manager: This role is still essential for breaking down the brief into tasks and assigning them to the appropriate team members.
AI Backend Developer: This role will be responsible for the backend of the application. Their specific tasks include the Supabase database design, creating API endpoints, handling authentication, security, and file processing.
AI Frontend Developer: This role will build the user-facing part of the app. Their responsibilities include creating React components, UI/UX design, state management, and ensuring a responsive design.
QA Tester: This agent will write and run tests to ensure the application works correctly. They will handle manual testing of features, check for edge cases and errors, and conduct cross-browser and usability testing.
AI DevOps/Deployment: This is a crucial role for automation. This agent will handle the GitHub setup, create the CI/CD pipeline, manage hosting with platforms like Vercel or Netlify, and handle environment management.


Phase Breakdown:
Phase 1: 
Planning and Initial Development (AI Project Manager & AI Developer)

Goal: 
Define the core features and set up the basic project structure. Use the Dugnad+ App Handover document

Tasks:
Create a file structure (e.g., `README.md`, `requirements.txt`, `app.py`). 
Write the initial code for a user registration system. 
Create a simple feature for users to propose a "dugnad" event. 
Phase 2: Event Management Feature (AI Developer & QA Tester)
Goal:
Implement the main functionality of the app. 
Tasks:
Add a feature that allows users to sign up for a specific "dugnad" event. 
Develop a basic dashboard to show who has signed up. 
Create tests to ensure the sign-up feature works correctly. 
Phase 3: Finalization and Documentation (All Roles)
Goal:
Clean up the code and prepare the project for release. 
Tasks:
Review all code for bugs and inefficiencies. 
Create comprehensive documentation on how to set up and run the app. * Write a final report on the project's completion. 
Instructions for the AI Team:
All communication and task management should happen through GitHub Issues. * Create a new issue for each task listed in the "Phase Breakdown" section. * When a task is complete, close the corresponding issue and push the changes to the `main` branch. * Push all final code to the repository. 
Dugnad+ App - Handover Dokument
Konseptsammendrag
En app-løsning for å automatisere dugnadshåndtering i norske idrettslag, med fokus på rettferdig fordeling, enkel administrasjon og positive insentiver for deltagelse.
Hovedfunksjoner
1. Automatisk vakttildeling
Dugnadsansvarlig legger inn alle vakter for sesongen (én gang)
Algoritme fordeler vakter automatisk basert på lavest poengsum først
14 dagers buffer hvor foreldre kan bytte/finne vikar før vakt
Eskalering til vikar-markedsplass hvis ingen løsning finnes
2. Poengsystem med nivåer
Grunnpoeng (kun for eget lag/barn):
Hovedtrener: 1000 poeng per sesong
Trener: 500 poeng per sesong
Andre ansvarlige (kasserer, utstyr etc): 300 poeng per sesong
Stå i kiosk: 100 poeng per time
Selge inngangsbilletter: 100 poeng per time
Rydde/rigge: 100 poeng per time
Bake kake/lage saft: 50 poeng per gang
Fair play ansvarlig: 200 poeng per sesong
Ekstrapoeng (overførbart på tvers av idrett/søsken):
Hovedtrener for søsken: +200 bonus-poeng til familiekonto
Trener for søsken: +100 bonus-poeng til familiekonto
Dugnad for søsken: +25 bonus-poeng til familiekonto
Nivåer (basert på grunnpoeng for eget lag):
Nivå 1: 100 poeng = grunnrabatter
Nivå 2: 300 poeng = bedre rabatter
Nivå 3: 500 poeng = premium fordeler
Nivå 4: 1000+ poeng = VIP-status
Bonuspoeng:
Vikar med kort varsel (<48 timer): +50 poeng
Hjelper andre med bytte/vikar: +25 poeng
Melder seg villig (selv om man ikke får vakt): +10 poeng
Perfekt oppmøte hele sesongen: +100 poeng
3. Beskyttede grupper (automatisk høyere nivå)
Trenerfamilier: Starter på Nivå 3, får aldri automatiske vakter
Dugnadsansvarlig: Starter på Nivå 4 + 500 bonuspoeng
Lagledere: Starter på Nivå 2
Forrige års toppbidragsytere: 50% færre automatiske tildelinger
4. "Jeg vil"-profil system
Erstatter "ikke tilgjengelig"-mentalitet med proaktiv tilnærming:
✅ "Jeg vil ta kiosk/salg-vakter"
✅ "Jeg vil ta praktisk arbeid"
✅ "Jeg vil ta transport/kjøring"
✅ "Jeg vil ta arrangement/organisering"
✅ "Jeg kan jobbe betalte vikarvakter"
✅ "Jeg vil ta ekstravakter for å komme opp i nivå"
5. Vikar-markedsplass
Proaktiv tilnærming - vikarer annonserer tilgjengelighet:
Vikarer legger ut ledig tid: "Tom er ledig denne helgen, kr 200/time"
Foreldre ser tilgjengelige vikarer før de trenger å sende forespørsler
Prissetting: Vikarer setter egen pris basert på type jobb og tid
Etterspørsel når nødvendig:
Hvis ingen forhåndstilgjengelige: Forelder sender "Trenger vikar søndag 10-14"
Push-notification til alle registrerte vikarer
Vikarer byr: "Kan ta den for kr 170/time" / "Kan ta den for kr 220/time"
Forelder velger beste tilbud basert på pris og timing
Brukeropplevelse:
Foreldre sjekker først "Ledige vikarer denne uka"
Direktekontakt hvis noen passer tidsmessig og prismessig
Hvis ingen passer → send vikar-forespørsel til alle
Chat-funksjon for å koordinere detaljer når avtale er på plass
Fordeler:
Proaktive vikarer får mer jobb og blir mer synlige
Konkurransedrevet prissetting
Mindre desperate siste-liten henvendelser
Bedre planlegging for både foreldre og vikarer
6. Sponsoravtaler med lokale bedrifter
Markedsføring for bedrifter:
Målrettet eksponering til velstående familier
Goodwill i lokalsamfunnet
Billig reklame via klubbens kanaler
Rabattnivåer:
Nivå 1: 10% rabatt hos utvalgte bedrifter
Nivå 2: 15% rabatt + flere bedrifter
Nivå 3: 20% rabatt + premium-partnere
Nivå 4: 25% rabatt + eksklusiv-tilbud + trekning om større premier
Betalingshåndtering
VIKTIG: Appen håndterer IKKE betalinger mellom parter, og det kan ikke kreves fast dugnadavgift i Norge.
Vikarer setter egen pris når de registrerer seg eller byr på oppdrag
Familie og vikar blir satt i kontakt og avtaler betaling direkte
Prisen bestemmes av tilbud og etterspørsel i systemet
Status oppdateres i app: "Vikar funnet ✅" eller "Løst på annen måte ✅"
Problemfamilier som ikke ordner vikar får "rødt flagg" og må følges opp manuelt
Tverr-idrett funksjonalitet
To typer poeng:
Grunnpoeng: Gjelder kun for det spesifikke laget/barnet (trenerjobb, kiosk etc.)
Familiepoeng: Overførbart mellom søsken og idretter
Eksempel: Mamma er hovedtrener for fotball (1000 grunnpoeng fotball + 200 familiepoeng), pappa står i kiosk for håndball (100 grunnpoeng håndball + 25 familiepoeng)
Nivåberegning: Basert på grunnpoeng for hvert enkelt lag
Ungdom (16-18 år) kan tjene familiepoeng for hele familien
For dugnadsansvarlig - enkel administrasjon
Oppsett: Legger inn vakter for hele sesongen én gang
Automatikk: System fordeler og varsler automatisk
Kun oppfølging: Får melding kun når noe krever manuell håndtering
Oversikt: Dashboard over hvem som har problemer med oppfølging
Tekniske krav (for utvikling)
Mobil-app (iOS/Android)
Push-notifications
QR-kode for rabatt-validering hos sponsorer
Chat-funksjon for koordinering mellom foreldre/vikarer
Admin-panel for dugnadsansvarlige
API-integrasjon med Spond/lignende systemer (hvis mulig)
Pilottest forslag - Kil Fotball G9
Eksisterende dugnad:
2 uker Gjemselund + 2 dager julecup = 8 timer per familie
44 familier, hvorav 13 bidro 0 kr på loddsalg
Testoppsett:
Vikarer setter egen pris (estimat 150-250 kr/time basert på tilbud/etterspørsel)
3-4 lokale sponsorer for rabattordning
Trenerfamilier starter på høyere nivå automatisk
Test av grunnpoeng vs familiepoeng-systemet
Suksessmål
90%+ vakter blir dekket uten oppfølging fra dugnadsansvarlig
Økt deltagelse eller økte inntekter fra "kjøp seg fri"
Mindre administrativt stress for frivillige ledere
Positive tilbakemeldinger fra både aktive og passive foreldre
Forretningsmodell og monetizing
Fase 1: Grunnfunksjoner (gratis)
Dugnadshåndtering og poengsystem
Vikar-markedsplass
Grunnleggende sponsoravtaler
Fase 2: Markedskanal for lokale bedrifter
Målrettet annonsering:
Demografisk presis: Familier med barn i aktiviteter = høy kjøpekraft
Geografisk nøyaktig: Kun lokale bedrifter til lokale familier
Interessebasert: Sportsbutikker til fotballfamilier, dansutstyr til dansefamilier etc.
Annonseformater:
Banner-annonser i app (øverst/nederst)
Sponsored rabatter: "Denne uken: 25% hos SportXperten (betalt innhold)"
Push-notifications: "Ny butikk i sentrum gir 20% til Dugnad+-medlemmer"
Arrangement-sponsing: "Julecupen presentert av McDonald's"
Prissetting for bedrifter:
CPM (per 1000 visninger): 50-200 kr avhengig av målgruppe
Månedlige pakker: 2000-10000 kr for kontinuerlig eksponering
Arrangement-sponsing: 5000-25000 kr per større event
Potensielle inntektsstrømmer
Annonseinntekter: Hovedinntektskilde
Premium-abonnement: Ekstra funksjoner for dugnadsansvarlige (5-10 kr/mnd)
Transaksjonsgebyr: 2-5% av vikar-betalinger (frivillig "tipp" til app)
White-label lisens: Selge løsningen til andre kommuner/regioner
Målgruppe-segmentering for annonsører
Familie-demografi: Barnefamilier 30-50 år, middel-høy inntekt
Interesser: Sport, helse, familie, lokale aktiviteter
Kjøpekraft: Over gjennomsnittet (barn i organiserte aktiviteter koster)
Lojalitet: Høy til lokale bedrifter som støtter barnas aktiviteter
Implementering
Ikke-påtrengende: Annonser må ikke forstyrre kjerneopplevelsen
Relevant: Kun lokale bedrifter, kun relevante produkter/tjenester
Transparent: Tydelig merking av betalt innhold
Opt-out: Brukere kan skru av annonser mot liten månedlig avgift
Neste steg
Teknisk utvikling
MVP (Minimum Viable Product) - kjerneresultater først
Pilottest med Kil Fotball G9 (44 familier)
Iterering basert på brukertilbakemeldinger
Skalering til flere lag i Kil, deretter andre klubber
Forretningsutvikling
Sponsor-akkvisisjon - start med 3-4 lokale bedrifter for rabattordning
Annonsepartnerskap - identifiser lokale bedrifter interessert i målrettet markedsføring
Finansieringsmodell - vurdere egenfinansiering vs investorer
Juridisk rammeverk - sikre GDPR-compliance og personvernhåndtering
Utrullingsstrategi
Lokal ekspansjon: Sandefjord → Vestfold → Norge
Idrettsspesifikk: Fotball → håndball/andre idretter
White-label: Selge løsningen til andre regioner/land

Dokument opprettet: September 2025


