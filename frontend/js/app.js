// ── Clean up duplicate headers defensively ───────────────────────────────
function cleanupDuplicateHeaders() {
    const headers = document.querySelectorAll('.site-header');
    if (headers.length > 1) {
        for (let i = 1; i < headers.length; i++) {
            headers[i].remove();
        }
    }
}
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanupDuplicateHeaders);
    } else {
        cleanupDuplicateHeaders();
    }
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => cleanupDuplicateHeaders());
        if (document.body) {
            observer.observe(document.body, { childList: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) observer.observe(document.body, { childList: true });
            });
        }
    }
}

// ── PWA: Register Service Worker ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = location.pathname.includes('/guides/') ? '../sw.js' : '/sw.js';
        navigator.serviceWorker.register(swPath).catch(() => {
            // Silently fail — offline support is a progressive enhancement
        });
    });
}

// ── i18n — Language strings (EN / NP / HI) ──────────────────────────────
const FC_STRINGS = {
    en: {
        brand: 'FamilyConnect',
        tagline: 'Disaster family assistance & reconnection',
        hotline: 'Emergency',
        navHome: 'Home',
        navSafe: 'I am safe',
        navMissing: 'Report someone missing',
        navTrack: 'Track a case',
        navTunnel: 'Tunnel rescue',
        navDNA: 'DNA identification',
        navAssistance: 'Assistance centres',
        navWater: 'Safe water',
        navShelter: 'Shelters',
        navInfo: 'Verified information',
        navPartner: 'Partner updates',
        navAgencies: 'Active agencies',
        navGuides: 'Guides',
        navAuthorities: 'For authorities',
        navSignIn: 'Coordinator Sign-in',
        navRumour: 'Rumour tracker',
        navDamage: 'Report damage',
        navRelief: 'Relief schedule',
        navWaterLvl: 'Water levels',
        langLabel: 'Language',
        eventLabel: 'Active Disaster Event',
        iAmSafeTitle: 'I Am Safe',
        iAmSafeDesc: 'Directly report your current well-being, establish contact channels, and notify your relatives while controlling your location privacy.',
        iAmSafeBtn: 'Declare Safety Status',
        reportMissingTitle: 'Report Missing Person',
        reportMissingDesc: 'Register an unaccounted-for relative. Creates a unified coordination record accessible across relief agencies.',
        reportMissingBtn: 'Initiate Tracing Case',
        trackCaseTitle: 'Track Active Case',
        trackCaseDesc: 'Query verified updates, schedule human reviews, attach physical identity evidence, or register an urgent logistical need.',
        trackCaseBtn: 'Access Case Record',
        eventUpdatesTitle: 'Event Updates',
        eventUpdatesSubtitle: 'Latest verified reports and ground intelligence',
        allVerifiedInfo: 'All verified information →',
        loadingUpdates: 'Loading latest event updates…',
        noUpdates: 'No published event updates available yet. Check back shortly.',
        safeHeading: 'I am safe',
        safeLede: 'Use this if you are the person affected and you are safe. We only ask for what is needed to match you to people who are looking for you.',
        fullNameLabel: 'Your full name',
        nationalityLabel: 'Nationality',
        locationDescLabel: 'Where you are now',
        contactLabel: 'How coordinators can reach you',
        messageLabel: 'Message for people looking for you',
        submitSafeBtn: 'Submit safety declaration',
        beforeSubmit: 'Before you submit',
        rule1: 'Only declare safety for yourself, or for someone present who asks you to.',
        rule2: 'A declaration is recorded as reported by you until a coordinator checks it.',
        rule3: 'Being related to someone does not by itself grant access to their case.',
        lblFullName: 'Your full name',
        lblNationality: 'Nationality',
        lblLocation: 'Where you are now',
        hintLocationSafe: 'A town, camp, hotel or landmark is enough.',
        lblContact: 'How coordinators can reach you',
        hintContactSafe: 'Phone number, email, or the name of someone with you.',
        lblMessageSafe: 'Message for people looking for you',
        hintMessageSafe: 'This may be shared with family who are authorised on your case.',
        missingHeading: 'Report someone missing',
        missingLede: 'Give us what you know. Nothing here is treated as confirmed — a coordinator checks each detail against named sources before anything is marked verified.',
        sectionAboutPerson: 'About the missing person',
        lblAge: 'Approximate age',
        lblDescription: 'Description',
        hintDescription: 'Height, build, clothing when last seen, distinguishing features.',
        lblTourGroup: 'Tour group, employer or organised party',
        lblVulnerable: 'This person may be especially at risk',
        descVulnerable: 'For example a child, an older person, someone with a medical need, or someone who may be at risk of harm or exploitation. This routes the case to a safeguarding lead.',
        sectionCircumstances: 'Last known circumstances',
        lblLastKnownLoc: 'Last known location',
        lblLastContactTime: 'Date and time you last had contact',
        lblCircumstances: 'What happened, as far as you know',
        sectionAboutReporter: 'About you',
        lblYourName: 'Your name',
        lblRelationship: 'Your relationship to the person',
        hintRelationship: 'For example: mother, colleague, tour leader.',
        lblYourContact: 'Your contact details',
        hintYourContact: 'Phone or email a coordinator can use.',
        lblWhereYouAre: 'Where you are',
        submitMissingBtn: 'Register missing person report',
        backToHome: 'Back to home',
        trackHeading: 'Check on a case',
        trackLede: 'Enter the reference number you were given when you submitted a report or safety declaration.',
        lblCaseRef: 'Case or submission reference',
        hintCaseRef: 'The reference was shown on screen after you submitted and sent to you by email or SMS if contact details were provided. It starts with',
        btnCheckStatus: 'Check status',
        optionalTag: '(optional)',
        dnaHeading: 'Request a DNA sample kit',
        dnaLede: 'If someone you love is missing and the authorities have taken DNA from unidentified remains before burial, your reference sample may be the strongest route to an answer.',
        dnaWhoTitle: 'Who should give a sample',
        dnaWhoDesc: 'A parent, child or sibling of the missing person gives the strongest comparison. More distant relatives can still help — a coordinator will advise. You do not need an account, and there is no charge.',
        dnaFormTitle: 'Apply to give a DNA reference sample',
        dnaFormDesc: 'Where the authorities have taken DNA from unidentified remains before burial, a close relative\'s reference sample can allow a later identification. Apply here and a coordinator will tell you where and when to attend. Only a laboratory and the responsible authority can confirm a match — this platform never does, and we never hold genetic data, only the laboratory\'s own reference numbers.',
        lblEmail: 'Email address',
        lblPhone: 'Phone number',
        hintRelationshipDna: 'A parent, child or sibling sample gives a far stronger result than a distant relative\'s.',
        lblMissingName: 'Missing person\'s name',
        lblExistingCaseRef: 'Existing case reference',
        hintExistingCaseRef: 'If you already reported them.',
        lblPreferredLocation: 'Where you can attend to give a sample',
        lblIdentificationDetails: 'Anything that may help identification',
        hintIdentificationDetails: 'Height, marks, dental work, clothing, jewellery, what they were carrying.',
        btnRequestKit: 'Request a sample kit',
        dnaNextTitle: 'What happens next',
        dnaStep1: 'You receive a tracking reference immediately — keep it with the email address you used.',
        dnaStep2: 'A coordinator contacts you to arrange where and when to give the sample.',
        dnaStep3: 'The laboratory compares your sample against profiles from remains and issues its own reference numbers.',
        dnaStep4: 'Comparisons are pre-sorted for coordinators, but only the responsible authority can confirm a match.',
        dnaStep5: 'Once you have a lab sample reference, you can record it yourself in the family DNA portal and see how comparisons are progressing.',
        btnTrackExisting: 'Track an existing case',
        btnReportMissing: 'Report someone missing',
        dnaPrivacyTitle: 'Your privacy',
        dnaPrivacyDesc: 'FamilyConnect never holds genetic data. We record only your contact details, your relationship, and the laboratory\'s own reference numbers. A DNA result is never shown to you as a match here — the responsible authority confirms identity and contacts you directly.',
    },
    np: {
        brand: 'फ्यामिलीकनेक्ट',
        tagline: 'प्रकोप परिवार सहायता र पुनर्मिलन',
        hotline: 'आपतकाल',
        navHome: 'गृहपृष्ठ',
        navSafe: 'म सुरक्षित छु',
        navMissing: 'हराएको व्यक्ति रिपोर्ट',
        navTrack: 'केस ट्र्याक',
        navTunnel: 'सुरुङ उद्धार',
        navDNA: 'DNA पहिचान',
        navAssistance: 'सहायता केन्द्र',
        navWater: 'सुरक्षित पानी',
        navShelter: 'आश्रय',
        navInfo: 'प्रमाणित जानकारी',
        navPartner: 'साझेदार अपडेट',
        navAgencies: 'सक्रिय संस्था',
        navGuides: 'गाइड',
        navAuthorities: 'अधिकारीहरूका लागि',
        navSignIn: 'संयोजक साइन-इन',
        navRumour: 'हल्ला ट्र्याकर',
        navDamage: 'क्षति रिपोर्ट गर्नुहोस्',
        navRelief: 'राहत तालिका',
        navWaterLvl: 'पानीको सतह',
        langLabel: 'भाषा',
        eventLabel: 'सक्रिय प्रकोप घटना',
        iAmSafeTitle: 'म सुरक्षित छु',
        iAmSafeDesc: 'आफ्नो अवस्था प्रत्यक्ष रिपोर्ट गर्नुहोस्, सम्पर्क स्थापित गर्नुहोस् र परिवारलाई जानकारी दिनुहोस्।',
        iAmSafeBtn: 'सुरक्षा स्थिति घोषणा गर्नुहोस्',
        reportMissingTitle: 'हराएको व्यक्ति रिपोर्ट गर्नुहोस्',
        reportMissingDesc: 'सम्पर्कविहीन आफन्त दर्ता गर्नुहोस्। राहत संस्थाहरूबीच साझा रेकर्ड सिर्जना हुन्छ।',
        reportMissingBtn: 'खोजी केस सुरु गर्नुहोस्',
        trackCaseTitle: 'सक्रिय केस ट्र्याक गर्नुहोस्',
        trackCaseDesc: 'प्रमाणित अपडेटहरू, मानव समीक्षा, र आवश्यक सामग्रीहरू हेर्नुहोस् वा थप्नुहोस्।',
        trackCaseBtn: 'केस रेकर्ड पहुँच गर्नुहोस्',
        eventUpdatesTitle: 'घटना अपडेटहरू',
        eventUpdatesSubtitle: 'पछिल्लो प्रमाणित रिपोर्ट र स्थलगत जानकारी',
        allVerifiedInfo: 'सबै प्रमाणित जानकारी →',
        loadingUpdates: 'पछिल्लो घटना अपडेटहरू लोड हुँदैछ…',
        noUpdates: 'यस घटनाका लागि अहिलेसम्म कुनै प्रमाणित अपडेट प्रकाशित गरिएको छैन।',
        safeHeading: 'म सुरक्षित छु',
        safeLede: 'यदि तपाईं प्रभावित व्यक्ति हुनुहुन्छ र सुरक्षित हुनुहुन्छ भने यो प्रयोग गर्नुहोस्।',
        fullNameLabel: 'तपाईंको पूरा नाम',
        nationalityLabel: 'राष्ट्रियता',
        locationDescLabel: 'तपाईं अहिले कहाँ हुनुहुन्छ',
        contactLabel: 'संयोजकहरूले कसरी सम्पर्क गर्न सक्छन्',
        messageLabel: 'तपाईंलाई खोजिरहेका व्यक्तिका लागि सन्देश',
        submitSafeBtn: 'सुरक्षा घोषणा पेश गर्नुहोस्',
        beforeSubmit: 'पेश गर्नु अघि',
        rule1: 'केवल आफ्नै लागि वा उपस्थित व्यक्तिको अनुरोधमा सुरक्षा घोषणा गर्नुहोस्।',
        rule2: 'संयोजकले जाँच नगरेसम्म यो तपाईंले दिएको रिपोर्टको रूपमा रहनेछ।',
        rule3: 'नाता प्रमाणित हुँदैमा केसमा स्वतः पहुँच प्राप्त हुँदैन।',
        lblFullName: 'तपाईंको पूरा नाम',
        lblNationality: 'राष्ट्रियता',
        lblLocation: 'तपाईं अहिले कहाँ हुनुहुन्छ',
        hintLocationSafe: 'शहर, शिविर, होटल वा स्थलचिन्ह पर्याप्त छ।',
        lblContact: 'संयोजकहरूले तपाईंलाई कसरी पुग्न सक्छन्',
        hintContactSafe: 'फोन नम्बर, इमेल, वा तपाईंसँग भएको व्यक्तिको नाम।',
        lblMessageSafe: 'तपाईंलाई खोजिरहेका व्यक्तिहरूको लागि सन्देश',
        hintMessageSafe: 'यो तपाईंको केसमा अधिकृत परिवारसँग साझा गर्न सकिन्छ।',
        missingHeading: 'हराएको व्यक्तिको रिपोर्ट गर्नुहोस्',
        missingLede: 'तपाईंलाई थाहा भएको कुरा हामीलाई दिनुहोस्। यहाँ कुनै पनि कुरा प्रमाणित मानिँदैन — एक संयोजकले प्रमाणित गर्नु अघि प्रत्येक विवरण नामित स्रोतहरू विरुद्ध जाँच गर्दछ।',
        sectionAboutPerson: 'हराएको व्यक्तिको बारेमा',
        lblAge: 'अनुमानित उमेर',
        lblDescription: 'विवरण',
        hintDescription: 'उचाइ, शरीर, अन्तिम पटक देख्दाको कपडा, विशिष्ट विशेषताहरू।',
        lblTourGroup: 'टूर समूह, रोजगारदाता वा संगठित पार्टी',
        lblVulnerable: 'यो व्यक्ति विशेष गरी जोखिममा हुन सक्छ',
        descVulnerable: 'उदाहरणका लागि एक बच्चा, एक वृद्ध व्यक्ति, चिकित्सा आवश्यकता भएको व्यक्ति, वा कोही जसलाई हानि वा शोषणको जोखिम हुन सक्छ। यसले केसलाई सुरक्षा लीडमा पुर्याउँछ।',
        sectionCircumstances: 'अन्तिम ज्ञात परिस्थितिहरू',
        lblLastKnownLoc: 'अन्तिम ज्ञात स्थान',
        lblLastContactTime: 'मिति र समय तपाईंले अन्तिम पटक सम्पर्क गर्नुभएको थियो',
        lblCircumstances: 'तपाईंलाई थाहा भएसम्म के भयो',
        sectionAboutReporter: 'तपाईंको बारेमा',
        lblYourName: 'तपाईंको नाम',
        lblRelationship: 'व्यक्तिसँग तपाईंको सम्बन्ध',
        hintRelationship: 'उदाहरणका लागि: आमा, सहकर्मी, टूर नेता।',
        lblYourContact: 'तपाईंको सम्पर्क विवरणहरू',
        hintYourContact: 'संयोजकले प्रयोग गर्न सक्ने फोन वा इमेल।',
        lblWhereYouAre: 'तपाईं कहाँ हुनुहुन्छ',
        submitMissingBtn: 'हराएको व्यक्तिको रिपोर्ट दर्ता गर्नुहोस्',
        backToHome: 'गृहमा फर्कनुहोस्',
        trackHeading: 'केस जाँच गर्नुहोस्',
        trackLede: 'तपाईंले रिपोर्ट वा सुरक्षा घोषणा पेस गर्दा तपाईंलाई दिइएको सन्दर्भ नम्बर प्रविष्ट गर्नुहोस्।',
        lblCaseRef: 'केस वा सबमिशन सन्दर्भ',
        hintCaseRef: 'तपाईंले पेस गरेपछि स्क्रिनमा सन्दर्भ देखाइएको थियो र सम्पर्क विवरणहरू प्रदान गरिएको खण्डमा इमेल वा एसएमएसद्वारा तपाईंलाई पठाइएको थियो। यो बाट सुरु हुन्छ',
        btnCheckStatus: 'स्थिति जाँच गर्नुहोस्',
        optionalTag: '(वैकल्पिक)',
        dnaHeading: 'DNA नमूना किट अनुरोध गर्नुहोस्',
        dnaLede: 'यदि तपाईंको कोही प्रियजन हराइरहेको छ र अधिकारीहरूले अन्त्येष्टि अघि अज्ञात अवशेषहरूबाट DNA लिएका छन् भने, तपाईंको सन्दर्भ नमूना उत्तरको सबैभन्दा बलियो मार्ग हुन सक्छ।',
        dnaWhoTitle: 'कसले नमूना दिनुपर्छ',
        dnaWhoDesc: 'हराएको व्यक्तिको आमाबाबु, बच्चा वा दाजुभाइ वा दिदीबहिनीले सबैभन्दा बलियो तुलना दिन्छन्। अझ टाढाका आफन्तहरूले अझै पनि मद्दत गर्न सक्छन् — एक संयोजकले सल्लाह दिनेछन्। तपाईंलाई खाता चाहिँदैन, र कुनै शुल्क लाग्दैन।',
        dnaFormTitle: 'DNA सन्दर्भ नमूना दिन आवेदन दिनुहोस्',
        dnaFormDesc: 'जहाँ अधिकारीहरूले अन्त्येष्टि अघि अज्ञात अवशेषहरूबाट DNA लिएका छन्, एक नजिकको आफन्तको सन्दर्भ नमूनाले पछि पहिचान गर्न अनुमति दिन सक्छ। यहाँ आवेदन दिनुहोस् र एक संयोजकले तपाईंलाई कहाँ र कहिले उपस्थित हुने बताउनेछ। केवल एक प्रयोगशाला र जिम्मेवार अधिकारीले मात्र मेल पुष्टि गर्न सक्छन् — यो प्लेटफर्मले कहिल्यै गर्दैन, र हामी कहिल्यै आनुवंशिक डेटा राख्दैनौं, केवल प्रयोगशालाको आफ्नै सन्दर्भ नम्बरहरू।',
        lblEmail: 'इमेल ठेगाना',
        lblPhone: 'फोन नम्बर',
        hintRelationshipDna: 'आमाबाबु, बच्चा वा दाजुभाइ वा दिदीबहिनीको नमूनाले टाढाको आफन्तको तुलनामा धेरै बलियो परिणाम दिन्छ।',
        lblMissingName: 'हराएको व्यक्तिको नाम',
        lblExistingCaseRef: 'अवस्थित केस सन्दर्भ',
        hintExistingCaseRef: 'यदि तपाईंले पहिले नै तिनीहरूलाई रिपोर्ट गर्नुभएको छ भने।',
        lblPreferredLocation: 'जहाँ तपाईं नमूना दिन उपस्थित हुन सक्नुहुन्छ',
        lblIdentificationDetails: 'पहिचान गर्न मद्दत गर्न सक्ने कुनै पनि कुरा',
        hintIdentificationDetails: 'उचाइ, दागहरू, दाँतको काम, कपडा, गहना, तिनीहरूले के बोकेका थिए।',
        btnRequestKit: 'एउटा नमूना किट अनुरोध गर्नुहोस्',
        dnaNextTitle: 'त्यसपछि के हुन्छ',
        dnaStep1: 'तपाईंले तुरुन्तै ट्र्याकिङ सन्दर्भ प्राप्त गर्नुहुन्छ — तपाईंले प्रयोग गर्नुभएको इमेल ठेगानासँग राख्नुहोस्।',
        dnaStep2: 'नमूना कहाँ र कहिले दिने भनेर व्यवस्था गर्न एक संयोजकले तपाईंलाई सम्पर्क गर्दछ।',
        dnaStep3: 'प्रयोगशालाले अवशेषहरूबाट प्रोफाइलहरू विरुद्ध तपाईंको नमूना तुलना गर्दछ र आफ्नै सन्दर्भ नम्बरहरू जारी गर्दछ।',
        dnaStep4: 'तुलनाहरू संयोजकहरूको लागि पूर्व-क्रमबद्ध हुन्छन्, तर केवल जिम्मेवार अधिकारीले मात्र मेल पुष्टि गर्न सक्छन्।',
        dnaStep5: 'एक पटक तपाईंसँग ल्याब नमूना सन्दर्भ भएपछि, तपाईं यसलाई परिवार DNA पोर्टलमा आफैं रेकर्ड गर्न सक्नुहुन्छ र तुलनाहरू कसरी अघि बढिरहेका छन् भनेर हेर्न सक्नुहुन्छ।',
        btnTrackExisting: 'अवस्थित केस ट्र्याक गर्नुहोस्',
        btnReportMissing: 'कोही हराएको रिपोर्ट गर्नुहोस्',
        dnaPrivacyTitle: 'तपाईंको गोपनीयता',
        dnaPrivacyDesc: 'FamilyConnect ले कहिल्यै आनुवंशिक डेटा राख्दैन। हामी केवल तपाईंको सम्पर्क विवरणहरू, तपाईंको सम्बन्ध, र प्रयोगशालाको आफ्नै सन्दर्भ नम्बरहरू रेकर्ड गर्छौं। DNA परिणाम तपाईंलाई यहाँ कहिल्यै मेलको रूपमा देखाइँदैन — जिम्मेवार अधिकारीले पहिचान पुष्टि गर्दछ र तपाईंलाई सीधा सम्पर्क गर्दछ।',
    },
    hi: {
        brand: 'फैमिलीकनेक्ट',
        tagline: 'आपदा परिवार सहायता और पुनर्मिलन',
        hotline: 'आपातकाल',
        navHome: 'होम',
        navSafe: 'मैं सुरक्षित हूँ',
        navMissing: 'लापता व्यक्ति रिपोर्ट',
        navTrack: 'केस ट्रैक',
        navTunnel: 'सुरंग बचाव',
        navDNA: 'DNA पहचान',
        navAssistance: 'सहायता केंद्र',
        navWater: 'सुरक्षित पानी',
        navShelter: 'आश्रय',
        navInfo: 'सत्यापित जानकारी',
        navPartner: 'भागीदार अपडेट',
        navAgencies: 'सक्रिय संस्थाएं',
        navGuides: 'गाइड',
        navAuthorities: 'प्राधिकरण के लिए',
        navSignIn: 'समन्वयक साइन-इन',
        navRumour: 'अफवाह ट्रैकर',
        navDamage: 'क्षति की रिपोर्ट करें',
        navRelief: 'राहत कार्यक्रम',
        navWaterLvl: 'जल स्तर',
        langLabel: 'भाषा',
        eventLabel: 'सक्रिय आपदा घटना',
        iAmSafeTitle: 'मैं सुरक्षित हूँ',
        iAmSafeDesc: 'सीधे अपनी कुशलता की रिपोर्ट करें, संपर्क माध्यम बनाएं और परिजनों को सूचित करें।',
        iAmSafeBtn: 'सुरक्षा स्थिति घोषित करें',
        reportMissingTitle: 'लापता व्यक्ति की रिपोर्ट करें',
        reportMissingDesc: 'लापता रिश्तेदार को पंजीकृत करें। राहत एजेंसियों के बीच एकीकृत रिकॉर्ड तैयार होता है।',
        reportMissingBtn: 'तलाश केस शुरू करें',
        trackCaseTitle: 'सक्रिय केस ट्रैक करें',
        trackCaseDesc: 'सत्यापित अपडेट देखें, समीक्षा का समय लें और पहचान के साक्ष्य संलग्न करें।',
        trackCaseBtn: 'केस रिकॉर्ड देखें',
        eventUpdatesTitle: 'घटना अपडेट',
        eventUpdatesSubtitle: 'नवीनतम सत्यापित रिपोर्ट और जमीनी जानकारी',
        allVerifiedInfo: 'सभी सत्यापित जानकारी →',
        loadingUpdates: 'नवीनतम घटना अपडेट लोड हो रहे हैं…',
        noUpdates: 'इस घटना के लिए अभी कोई सत्यापित अपडेट प्रकाशित नहीं किया गया है।',
        safeHeading: 'मैं सुरक्षित हूँ',
        safeLede: 'यदि आप प्रभावित व्यक्ति हैं और सुरक्षित हैं, तो इसका उपयोग करें।',
        fullNameLabel: 'आपका पूरा नाम',
        nationalityLabel: 'राष्ट्रीयता',
        locationDescLabel: 'आप अभी कहाँ हैं',
        contactLabel: 'समन्वयक आपसे कैसे संपर्क कर सकते हैं',
        messageLabel: 'आपको खोजने वालों के लिए संदेश',
        submitSafeBtn: 'सुरक्षा घोषणा प्रस्तुत करें',
        beforeSubmit: 'प्रस्तुत करने से पहले',
        rule1: 'केवल अपने लिए या उपस्थित व्यक्ति के अनुरोध पर ही सुरक्षा घोषणा करें।',
        rule2: 'समन्वयक द्वारा सत्यापन किए जाने तक यह केवल आपकी रिपोर्ट रहेगी।',
        rule3: 'रिश्तेदार होने मात्र से केस का पूर्ण अधिकार नहीं मिलता।',
        lblFullName: 'आपका पूरा नाम',
        lblNationality: 'राष्ट्रीयता',
        lblLocation: 'आप अभी कहाँ हैं',
        hintLocationSafe: 'एक शहर, शिविर, होटल या लैंडमार्क पर्याप्त है।',
        lblContact: 'समन्वयक आप तक कैसे पहुँच सकते हैं',
        hintContactSafe: 'फ़ोन नंबर, ईमेल, या आपके साथ किसी का नाम।',
        lblMessageSafe: 'आपके लिए खोज रहे लोगों के लिए संदेश',
        hintMessageSafe: 'यह आपके मामले में अधिकृत परिवार के साथ साझा किया जा सकता है।',
        missingHeading: 'लापता व्यक्ति की रिपोर्ट करें',
        missingLede: 'आप जो जानते हैं हमें बताएं। कुछ भी प्रमाणित नहीं माना जाता है — एक समन्वयक किसी भी चीज़ को सत्यापित करने से पहले नामित स्रोतों के खिलाफ प्रत्येक विवरण की जांच करता है।',
        sectionAboutPerson: 'लापता व्यक्ति के बारे में',
        lblAge: 'अनुमानित आयु',
        lblDescription: 'विवरण',
        hintDescription: 'ऊंचाई, शरीर, आखिरी बार देखे जाने पर कपड़े, विशिष्ट विशेषताएं।',
        lblTourGroup: 'टूर समूह, नियोक्ता या संगठित पार्टी',
        lblVulnerable: 'यह व्यक्ति विशेष रूप से जोखिम में हो सकता है',
        descVulnerable: 'उदाहरण के लिए एक बच्चा, एक वृद्ध व्यक्ति, चिकित्सा आवश्यकता वाला कोई व्यक्ति, या कोई ऐसा व्यक्ति जिसे नुकसान या शोषण का खतरा हो सकता है। यह मामले को एक सुरक्षा लीड के पास भेजता है।',
        sectionCircumstances: 'अंतिम ज्ञात परिस्थितियां',
        lblLastKnownLoc: 'अंतिम ज्ञात स्थान',
        lblLastContactTime: 'तारीख और समय जब आपने आखिरी बार संपर्क किया था',
        lblCircumstances: 'आप जहाँ तक जानते हैं, क्या हुआ',
        sectionAboutReporter: 'आपके बारे में',
        lblYourName: 'आपका नाम',
        lblRelationship: 'व्यक्ति से आपका संबंध',
        hintRelationship: 'उदाहरण के लिए: माँ, सहकर्मी, टूर लीडर।',
        lblYourContact: 'आपके संपर्क विवरण',
        hintYourContact: 'फ़ोन या ईमेल जिसका उपयोग समन्वयक कर सकता है।',
        lblWhereYouAre: 'आप कहाँ हैं',
        submitMissingBtn: 'लापता व्यक्ति की रिपोर्ट दर्ज करें',
        backToHome: 'होम पर वापस जाएं',
        trackHeading: 'किसी मामले की जांच करें',
        trackLede: 'जब आपने कोई रिपोर्ट या सुरक्षा घोषणा प्रस्तुत की थी तो आपको दिया गया संदर्भ संख्या दर्ज करें।',
        lblCaseRef: 'मामला या सबमिशन संदर्भ',
        hintCaseRef: 'आपके सबमिट करने के बाद स्क्रीन पर संदर्भ दिखाया गया था और यदि संपर्क विवरण प्रदान किए गए थे तो आपको ईमेल या एसएमएस द्वारा भेजा गया था। यह शुरू होता है',
        btnCheckStatus: 'स्थिति जांचें',
        optionalTag: '(वैकल्पिक)',
        dnaHeading: 'डीएनए नमूना किट का अनुरोध करें',
        dnaLede: 'यदि आपका कोई प्रियजन लापता है और अधिकारियों ने दफनाने से पहले अज्ञात अवशेषों से डीएनए लिया है, तो आपका संदर्भ नमूना एक उत्तर का सबसे मजबूत मार्ग हो सकता है।',
        dnaWhoTitle: 'नमूना किसे देना चाहिए',
        dnaWhoDesc: 'लापता व्यक्ति के माता-पिता, बच्चे या भाई-बहन सबसे मजबूत तुलना देते हैं। अधिक दूर के रिश्तेदार अभी भी मदद कर सकते हैं — एक समन्वयक सलाह देगा। आपको खाते की आवश्यकता नहीं है, और कोई शुल्क नहीं है।',
        dnaFormTitle: 'डीएनए संदर्भ नमूना देने के लिए आवेदन करें',
        dnaFormDesc: 'जहां अधिकारियों ने दफनाने से पहले अज्ञात अवशेषों से डीएनए लिया है, एक करीबी रिश्तेदार का संदर्भ नमूना बाद में पहचान की अनुमति दे सकता है। यहां आवेदन करें और एक समन्वयक आपको बताएगा कि कहां और कब भाग लेना है। केवल एक प्रयोगशाला और जिम्मेदार प्राधिकारी ही मैच की पुष्टि कर सकते हैं — यह मंच कभी नहीं करता है, और हम कभी भी आनुवंशिक डेटा नहीं रखते हैं, केवल प्रयोगशाला के स्वयं के संदर्भ संख्या।',
        lblEmail: 'ईमेल पता',
        lblPhone: 'फोन नंबर',
        hintRelationshipDna: 'माता-पिता, बच्चे या भाई-बहन का नमूना दूर के रिश्तेदार की तुलना में कहीं अधिक मजबूत परिणाम देता है।',
        lblMissingName: 'लापता व्यक्ति का नाम',
        lblExistingCaseRef: 'मौजूदा केस संदर्भ',
        hintExistingCaseRef: 'यदि आपने पहले ही उनकी रिपोर्ट कर दी है।',
        lblPreferredLocation: 'जहां आप नमूना देने के लिए उपस्थित हो सकते हैं',
        lblIdentificationDetails: 'पहचान में मदद करने वाली कोई भी बात',
        hintIdentificationDetails: 'ऊंचाई, निशान, दांतों का काम, कपड़े, आभूषण, वे क्या ले जा रहे थे।',
        btnRequestKit: 'एक नमूना किट का अनुरोध करें',
        dnaNextTitle: 'आगे क्या होता है',
        dnaStep1: 'आपको तुरंत एक ट्रैकिंग संदर्भ प्राप्त होता है — इसे उस ईमेल पते के साथ रखें जिसका आपने उपयोग किया था।',
        dnaStep2: 'नमूना कहां और कब देना है, इसकी व्यवस्था करने के लिए एक समन्वयक आपसे संपर्क करता है।',
        dnaStep3: 'प्रयोगशाला अवशेषों से प्रोफाइल के खिलाफ आपके नमूने की तुलना करती है और अपनी स्वयं की संदर्भ संख्या जारी करती है।',
        dnaStep4: 'तुलना समन्वयकों के लिए पूर्व-सॉर्ट की जाती है, लेकिन केवल जिम्मेदार प्राधिकारी ही एक मैच की पुष्टि कर सकते हैं।',
        dnaStep5: 'एक बार जब आपके पास लैब नमूना संदर्भ हो, तो आप इसे परिवार डीएनए पोर्टल में स्वयं दर्ज कर सकते हैं और देख सकते हैं कि तुलना कैसे प्रगति कर रही है।',
        btnTrackExisting: 'मौजूदा केस को ट्रैक करें',
        btnReportMissing: 'किसी के लापता होने की रिपोर्ट करें',
        dnaPrivacyTitle: 'आपकी गोपनीयता',
        dnaPrivacyDesc: 'FamilyConnect कभी भी आनुवंशिक डेटा नहीं रखता है। हम केवल आपके संपर्क विवरण, आपके रिश्ते, और प्रयोगशाला के स्वयं के संदर्भ संख्या रिकॉर्ड करते हैं। डीएनए परिणाम आपको यहां कभी भी मैच के रूप में नहीं दिखाया जाता है — जिम्मेदार प्राधिकारी पहचान की पुष्टि करता है और आपसे सीधे संपर्क करता है।',
    },
    as: {
        brand: 'ফেমিলি-কনেক্ট',
        tagline: 'দুৰ্যোগ পৰিয়াল সাহায্য আৰু পুনৰ্মিলন',
        hotline: 'জৰুৰীকালীন',
        navHome: 'গৃহপৃষ্ঠা',
        navSafe: 'মই সুৰক্ষিত',
        navMissing: 'নিৰুদ্দিষ্ট ব্যক্তিৰ ৰিপৰ্ট',
        navTrack: 'কেছ ট্ৰেক কৰক',
        navTunnel: 'সুৰংগ উদ্ধাৰ',
        navDNA: 'ডি এন এ চিনাক্তকৰণ',
        navAssistance: 'সাহায্য কেন্দ্ৰ',
        navWater: 'সুৰক্ষিত পানী',
        navShelter: 'আশ্রয় কেন্দ্র',
        navInfo: 'সত্যাাপিত তথ্য',
        navPartner: 'অংশীদাৰ আপডেট',
        navAgencies: 'সক্ৰিয় সংস্থা',
        navGuides: 'গাইডসমূহ',
        navAuthorities: 'কর্তৃপক্ষৰ বাবে',
        navSignIn: 'সমন্বয়ক ছাইন-ইন',
        navRumour: 'গুজব ট্ৰেকাৰ',
        navDamage: 'ক্ষতিৰ ৰিপৰ্ট',
        navRelief: 'সাহায্য সূচী',
        navWaterLvl: 'পানীৰ স্তৰ',
        langLabel: 'ভাষা',
        eventLabel: 'সক্ৰিয় দুৰ্যোগৰ ঘটনা',
        iAmSafeTitle: 'মই সুৰক্ষিত',
        iAmSafeDesc: 'আপোনাৰ কুশল-বাৰ্তা পোনপটীয়াকৈ জনাওক, যোগাযোগ মাধ্যম স্থাপন কৰক আৰু পৰিয়ালক অৱগত কৰক।',
        iAmSafeBtn: 'সুৰক্ষা স্থিতি ঘোষণা কৰক',
        reportMissingTitle: 'নিৰুদ্দিষ্ট ব্যক্তিৰ ৰিপৰ্ট কৰক',
        reportMissingDesc: 'নিৰুদ্দিষ্ট আত্মীয়ক পঞ্জীয়ন কৰক। সাহায্য সংস্থাসমূহৰ বাবে এক উমৈহতীয়া তথ্য সংৰক্ষণ কৰা হয়।',
        reportMissingBtn: 'অনুসন্ধান প্রক্রিয়া আৰম্ভ কৰক',
        trackCaseTitle: 'সক্ৰিয় কেছ ট্ৰেক কৰক',
        trackCaseDesc: 'প্ৰমাণিত আপডেট পৰীক্ষা কৰক, মানৱ পৰ্যালোচনা অনুৰোধ কৰক আৰু পৰিচয় প্ৰমাণ সংলগ্ন কৰক।',
        trackCaseBtn: 'কেছ তথ্য চাওক',
        eventUpdatesTitle: 'দুৰ্যোগৰ শেহতীয়া তথ্য',
        eventUpdatesSubtitle: 'শেহতীয়া প্ৰমাণিত প্ৰতিবেদন আৰু ক্ষেত্ৰীয় তথ্য',
        allVerifiedInfo: 'সকলো প্ৰমাণিত তথ্য →',
        loadingUpdates: 'শেহতীয়া দুৰ্যোগৰ তথ্য লোড হৈ আছে…',
        noUpdates: 'এই দুৰ্যোগৰ বাবে এতিয়ালৈকে কোনো প্ৰমাণিত তথ্য প্ৰকাশ হোৱা নাই।',
        safeHeading: 'মই সুৰক্ষিত',
        safeLede: 'আপুনি যদি দুৰ্যোগত প্ৰভাৱিত আৰু সুৰক্ষিত, এইটো ব্যৱহাৰ কৰক। বিচৰাসকলৰ সৈতে সংযোগ কৰিবলৈ প্ৰয়োজনীয় তথ্যহে সংগ্ৰহ কৰা হয়।',
        fullNameLabel: 'আপোনাৰ সম্পূৰ্ণ নাম',
        nationalityLabel: 'নাগৰিকত্ব',
        locationDescLabel: 'আপুনি এতিয়া ক\'ত আছে',
        contactLabel: 'সমন্বয়কসকলে কেনেকৈ যোগাযোগ কৰিব',
        messageLabel: 'আপোনাক বিচাৰি থকাসকলৰ বাবে বাৰ্তা',
        submitSafeBtn: 'সুৰক্ষা ঘোষণা দাখিল কৰক',
        beforeSubmit: 'দাখিল কৰাৰ পূৰ্বে মন কৰক',
        rule1: 'কেৱল নিজৰ বাবে বা উপস্থিত থকা ব্যক্তিৰ অনুৰোধতহে সুৰক্ষা ঘোষণা কৰক।',
        rule2: 'সমন্বয়কে পৰীক্ষা নকৰালৈকে এইটো আপুনি দিয়া ৰিপৰ্ট হিচাপে গণ্য হ\'ব।',
        rule3: 'কেৱল আত্মীয় হোৱাৰ বাবেই কেছৰ সম্পূৰ্ণ তথ্য লাভ কৰিব নোৱাৰিব।',
        lblFullName: 'আপোনাৰ সম্পূৰ্ণ নাম',
        lblNationality: 'নাগৰিকত্ব',
        lblLocation: 'আপুনি এতিয়া ক\'ত আছে',
        hintLocationSafe: 'এখন চহৰ, শিবিৰ, হোটেল বা চিনাক্ত স্থান যথেষ্ট।',
        lblContact: 'সমন্বয়কসকলে কেনেকৈ যোগাযোগ কৰিব পাৰিব',
        hintContactSafe: 'ফোন নম্বৰ, ইমেইল, বা আপোনাৰ লগত থকা কাৰোবাৰ নাম।',
        lblMessageSafe: 'আপোনাক বিচাৰি থকাসকলৰ বাবে বাৰ্তা',
        hintMessageSafe: 'এইটো আপোনাৰ কেছত কৰ্তৃত্বপ্ৰাপ্ত পৰিয়ালৰ সৈতে শ্বেয়াৰ কৰা হ\'ব পাৰে।',
        missingHeading: 'নিৰুদ্দিষ্ট ব্যক্তিৰ ৰিপৰ্ট কৰক',
        missingLede: 'আপুনি জনাখিনি আমাক দিয়ক। ইয়াত একো নিশ্চিত বুলি গণ্য কৰা নহয় — যিকোনো কথা প্ৰমাণিত হিচাপে চিহ্নিত কৰাৰ আগতে এজন সমন্বয়কে নাম উল্লেখ কৰা উৎসৰ বিপৰীতে প্ৰতিটো বিৱৰণ পৰীক্ষা কৰে।',
        sectionAboutPerson: 'নিৰুদ্দিষ্ট ব্যক্তিজনৰ বিষয়ে',
        lblAge: 'আনুমানিক বয়স',
        lblDescription: 'বিৱৰণ',
        hintDescription: 'উচ্চতা, গঠন, শেষবাৰ দেখাৰ সময়ত পিন্ধা কাপোৰ, বিশেষ বৈশিষ্ট্য।',
        lblTourGroup: 'ট্যুৰ গ্ৰুপ, নিয়োগকৰ্তা বা সংগঠিত পাৰ্টি',
        lblVulnerable: 'এই ব্যক্তিজন বিশেষকৈ বিপদাপন্ন হ\'ব পাৰে',
        descVulnerable: 'উদাহৰণস্বৰূপে এটি শিশু, এজন বৃদ্ধ ব্যক্তি, চিকিৎসাৰ প্ৰয়োজন থকা কোনোবা, বা কোনোবা যি ক্ষতি বা শোষণৰ বিপদত পৰিব পাৰে। ই কেছটো এটা নিৰাপত্তা সুৰক্ষা দললৈ পঠায়।',
        sectionCircumstances: 'শেষ জ্ঞাত পৰিস্থিতি',
        lblLastKnownLoc: 'শেষ জ্ঞাত স্থান',
        lblLastContactTime: 'তাৰিখ আৰু সময় আপুনি শেষবাৰ যোগাযোগ কৰিছিল',
        lblCircumstances: 'আপুনি জনা মতে কি হৈছিল',
        sectionAboutReporter: 'আপোনাৰ বিষয়ে',
        lblYourName: 'আপোনাৰ নাম',
        lblRelationship: 'ব্যক্তিজনৰ সৈতে আপোনাৰ সম্পৰ্ক',
        hintRelationship: 'উদাহৰণস্বৰূপে: মাতৃ, সহকৰ্মী, ট্যুৰ লিডাৰ।',
        lblYourContact: 'আপোনাৰ যোগাযোগৰ বিৱৰণ',
        hintYourContact: 'এজন সমন্বয়কে ব্যৱহাৰ কৰিব পৰা ফোন বা ইমেইল।',
        lblWhereYouAre: 'আপুনি ক\'ত আছে',
        submitMissingBtn: 'নিৰুদ্দিষ্ট ব্যক্তিৰ ৰিপৰ্ট পঞ্জীয়ন কৰক',
        backToHome: 'মূল পৃষ্ঠালৈ ঘূৰি যাওক',
        trackHeading: 'এটা কেছ পৰীক্ষা কৰক',
        trackLede: 'আপুনি ৰিপৰ্ট বা সুৰক্ষা ঘোষণা দাখিল কৰোঁতে আপোনাক দিয়া ৰেফাৰেন্স নম্বৰটো সুমুৱাওক।',
        lblCaseRef: 'কেছ বা ছাবমিছন ৰেফাৰেন্স',
        hintCaseRef: 'আপুনি দাখিল কৰাৰ পিছত স্ক্ৰীণত ৰেফাৰেন্সটো দেখুওৱা হৈছিল আৰু যদি যোগাযোগৰ বিৱৰণ প্ৰদান কৰা হৈছিল তেন্তে ইমেইল বা এছএমএছৰ জৰিয়তে আপোনালৈ প্ৰেৰণ কৰা হৈছিল। ই আৰম্ভ হয়',
        btnCheckStatus: 'স্থিতি পৰীক্ষা কৰক',
        optionalTag: '(ঐচ্ছিক)',
        dnaHeading: 'ডিএনএ নমুনা কিটৰ বাবে অনুৰোধ কৰক',
        dnaLede: 'যদি আপোনাৰ কোনো প্ৰিয়জন নিৰুদ্দিষ্ট হৈছে আৰু কৰ্তৃপক্ষই সমাধিস্থ কৰাৰ আগতে অজ্ঞাত অৱশিষ্টৰ পৰা ডিএনএ লৈছে, তেন্তে আপোনাৰ ৰেফাৰেন্স নমুনা এটা উত্তৰৰ আটাইতকৈ শক্তিশালী পথ হ\'ব পাৰে।',
        dnaWhoTitle: 'কোনে নমুনা দিব লাগে',
        dnaWhoDesc: 'নিৰুদ্দিষ্ট ব্যক্তিজনৰ পিতৃ-মাতৃ, সন্তান বা ভাই-ভনীয়ে আটাইতকৈ শক্তিশালী তুলনা দিয়ে। অধিক দূৰৈৰ আত্মীয়সকলেও সহায় কৰিব পাৰে — এজন সমন্বয়কে পৰামৰ্শ দিব। আপোনাক একাউণ্টৰ প্ৰয়োজন নাই, আৰু কোনো মাচুল নাই।',
        dnaFormTitle: 'ডিএনএ ৰেফাৰেন্স নমুনা দিবলৈ আবেদন কৰক',
        dnaFormDesc: 'য\'ত কৰ্তৃপক্ষই সমাধিস্থ কৰাৰ আগতে অজ্ঞাত অৱশিষ্টৰ পৰা ডিএনএ লৈছে, এজন ঘনিষ্ঠ আত্মীয়ৰ ৰেফাৰেন্স নমুনাই পিছলৈ চিনাক্তকৰণত সহায় কৰিব পাৰে। ইয়াত আবেদন কৰক আৰু এজন সমন্বয়কে আপোনাক ক\'ত আৰু কেতিয়া উপস্থিত থাকিব লাগিব জনাব। কেৱল এটা পৰীক্ষাগাৰ আৰু দায়বদ্ধ কৰ্তৃপক্ষইহে এটা মিল নিশ্চিত কৰিব পাৰে — এই প্লেটফৰ্মে কেতিয়াও নকৰে, আৰু আমি কেতিয়াও জিনীয় তথ্য নাৰাখোঁ, কেৱল পৰীক্ষাগাৰৰ নিজা ৰেফাৰেন্স নম্বৰসমূহ।',
        lblEmail: 'ইমেইল ঠিকনা',
        lblPhone: 'ফোন নম্বৰ',
        hintRelationshipDna: 'পিতৃ-মাতৃ, সন্তান বা ভাই-ভনীৰ নমুনাই দূৰৈৰ আত্মীয়ৰ তুলনাত বহু বেছি শক্তিশালী ফলাফল দিয়ে।',
        lblMissingName: 'নিৰুদ্দিষ্ট ব্যক্তিজনৰ নাম',
        lblExistingCaseRef: 'বৰ্তমানৰ কেছ ৰেফাৰেন্স',
        hintExistingCaseRef: 'যদি আপুনি ইতিমধ্যে তেওঁলোকক ৰিপৰ্ট কৰিছে।',
        lblPreferredLocation: 'য\'ত আপুনি নমুনা দিবলৈ উপস্থিত থাকিব পাৰিব',
        lblIdentificationDetails: 'চিনাক্তকৰণত সহায় কৰিব পৰা যিকোনো কথা',
        hintIdentificationDetails: 'উচ্চতা, দাগ, দাঁতৰ কাম, কাপোৰ, আ-অলংকাৰ, তেওঁলোকে কি লৈ আছিল।',
        btnRequestKit: 'এটা নমুনা কিট অনুৰোধ কৰক',
        dnaNextTitle: 'ইয়াৰ পিছত কি হ\'ব',
        dnaStep1: 'আপুনি লগে লগে এটা ট্ৰেকিং ৰেফাৰেন্স লাভ কৰে — আপুনি ব্যৱহাৰ কৰা ইমেইল ঠিকনাৰ সৈতে ৰাখক।',
        dnaStep2: 'নমুনা ক\'ত আৰু কেতিয়া দিব তাৰ ব্যৱস্থা কৰিবলৈ এজন সমন্বয়কে আপোনাৰ সৈতে যোগাযোগ কৰে।',
        dnaStep3: 'পৰীক্ষাগাৰে অৱশিষ্টৰ পৰা প্ৰফাইলৰ বিপৰীতে আপোনাৰ নমুনা তুলনা কৰে আৰু ইয়াৰ নিজা ৰেফাৰেন্স নম্বৰ জাৰি কৰে।',
        dnaStep4: 'তুলনাসমূহ সমন্বয়কসকলৰ বাবে আগতীয়াভাৱে সজোৱা হয়, কিন্তু কেৱল দায়বদ্ধ কৰ্তৃপক্ষইহে এটা মিল নিশ্চিত কৰিব পাৰে।',
        dnaStep5: 'এবাৰ আপোনাৰ হাতত লেব নমুনা ৰেফাৰেন্স থাকিলে, আপুনি নিজে ইয়াক পৰিয়াল ডিএনএ পৰ্টেলত ৰেকৰ্ড কৰিব পাৰে আৰু তুলনাসমূহ কেনেকৈ আগবাঢ়িছে চাব পাৰে।',
        btnTrackExisting: 'বৰ্তমানৰ এটা কেছ ট্ৰেক কৰক',
        btnReportMissing: 'নিৰুদ্দিষ্ট কোনোবা এজনৰ ৰিপৰ্ট কৰক',
        dnaPrivacyTitle: 'আপোনাৰ গোপনীয়তা',
        dnaPrivacyDesc: 'FamilyConnect য়ে কেতিয়াও জিনীয় তথ্য নাৰাখে। আমি কেৱল আপোনাৰ যোগাযোগৰ বিৱৰণ, আপোনাৰ সম্পৰ্ক, আৰু পৰীক্ষাগাৰৰ নিজা ৰেফাৰেন্স নম্বৰসমূহ ৰেকৰ্ড কৰোঁ। এটা ডিএনএ ফলাফল কেতিয়াও ইয়াত আপোনাক এটা মিল হিচাপে দেখুওৱা নহয় — দায়বদ্ধ কৰ্তৃপক্ষই পৰিচয় নিশ্চিত কৰে আৰু আপোনাৰ সৈতে পোনপটীয়াকৈ যোগাযোগ কৰে।',
    },
};

const ALL_LANGUAGES = {
    en: { code: 'en', name: 'English (EN)' },
    as: { code: 'as', name: 'অসমীয়া / Assamese (AS)' },
    hi: { code: 'hi', name: 'हिन्दी / Hindi (HI)' },
    np: { code: 'np', name: 'नेपाली / Nepali (NP)' }
};

function updateLanguageDropdown() {
    const langSwitcher = document.getElementById('lang-switcher');
    if (!langSwitcher) return;

    const currentLang = getLang();
    langSwitcher.innerHTML = '';
    Object.values(ALL_LANGUAGES).forEach(langInfo => {
        const option = document.createElement('option');
        option.value = langInfo.code;
        option.textContent = langInfo.name;
        if (langInfo.code === currentLang) {
            option.selected = true;
        }
        langSwitcher.appendChild(option);
    });
}

function getLang() {
    return localStorage.getItem('fc_lang') || 'en';
}
function setLang(lang) {
    localStorage.setItem('fc_lang', lang);
}
function t(key) {
    const lang = getLang();
    return (FC_STRINGS[lang] || FC_STRINGS.en)[key] || FC_STRINGS.en[key] || key;
}

function renderChrome() {
    // Inject Google Fonts if not already present (sub-pages skip the <link> in <head>)
    if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
        const preconn1 = Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://fonts.googleapis.com' });
        const preconn2 = Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' });
        const fontLink = Object.assign(document.createElement('link'), {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Public+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap'
        });
        document.head.prepend(fontLink);
        document.head.prepend(preconn2);
        document.head.prepend(preconn1);
    }

    // Use root-absolute base prefix so navigation links work from anywhere (root, /console/*, /guides/*)
    const base = '/';

    const lang = getLang();

    // Determine current active event ID (default to active disaster: EVENT-IN-FL-2026-1187)
    const urlParams = new URLSearchParams(window.location.search);
    const eventFromUrl = urlParams.get('event');
    if (eventFromUrl) {
        localStorage.setItem('fc_current_event_id', eventFromUrl);
    }
    const currentEventId = eventFromUrl || localStorage.getItem('fc_current_event_id') || window.FC_EVENT_ID || 'EVENT-IN-FL-2026-1187';
    const eventParam = currentEventId ? `?event=${encodeURIComponent(currentEventId)}` : '';

    // Synchronously generate initial language options with all supported languages
    let langOptionsHtml = '';
    Object.values(ALL_LANGUAGES).forEach(langInfo => {
        langOptionsHtml += `<option value="${langInfo.code}" ${lang === langInfo.code ? 'selected' : ''}>${langInfo.name}</option>`;
    });

    // ── Site header ──────────────────────────────────────────────────────
    cleanupDuplicateHeaders();
    const header = document.querySelector('.site-header');
    if (!header) return;
    

    // Event switcher
    const eventSwitcher = header.querySelector('#event-switcher');
    
    if (typeof api !== 'undefined' && typeof api.getActiveEvents === 'function') {
        api.getActiveEvents().then(data => {
            if (data.events && data.events.length > 0) {
                eventSwitcher.innerHTML = '';
                let foundCurrent = false;
                data.events.forEach(ev => {
                    const option = document.createElement('option');
                    option.value = ev.event_id;
                    option.textContent = ev.name;
                    if (ev.event_id === currentEventId) {
                        option.selected = true;
                        foundCurrent = true;
                    }
                    eventSwitcher.appendChild(option);
                });
                if (!foundCurrent) {
                    eventSwitcher.innerHTML += `<option value="${currentEventId}" selected>${currentEventId}</option>`;
                }

                // Dynamic UI Updates based on selected event
                const currentEventData = data.events.find(ev => ev.event_id === currentEventId) || data.events[0];
                
                // Ensure language options are updated
                updateLanguageDropdown();

                if (currentEventData) {
                    document.querySelectorAll('.fc-dynamic-event-name').forEach(el => el.textContent = currentEventData.name);
                    document.querySelectorAll('.fc-dynamic-event-region').forEach(el => el.textContent = currentEventData.region || currentEventData.country);
                    
                    const hotlineEl = header.querySelector('.site-header-hotline');
                    if (hotlineEl) {
                        if (currentEventData.country === 'IN' || (currentEventData.event_id && currentEventData.event_id.startsWith('EVENT-IN'))) {
                            hotlineEl.setAttribute('href', 'tel:1070');
                            hotlineEl.innerHTML = `<span data-i18n="hotline">${t('hotline')}</span>: <strong>1070 (ASDMA) / 112</strong>`;
                        } else {
                            hotlineEl.setAttribute('href', 'tel:+9779999999');
                            hotlineEl.innerHTML = `<span data-i18n="hotline">${t('hotline')}</span>: <strong>+977 9999 999</strong>`;
                        }
                    }
                    
                    const brandLink = header.querySelector('a.site-brand');
                    if (brandLink && eventParam) {
                        brandLink.setAttribute('href', `${base}index.html${eventParam}`);
                    }
                    const signInLink = header.querySelector('a[href*="console.html"]');
                    if (signInLink && eventParam) {
                        signInLink.setAttribute('href', `${base}console.html${eventParam}`);
                    }
                    
                    if (currentEventData.modules && currentEventData.modules.length > 0) {
                        const navList = header.querySelector('.site-nav-list');
                        if (navList) {
                            let navHtml = `<li><a href="${base}index.html${eventParam}">${t('navHome')}</a></li>`;
                            const localFileMap = {
                                'MOD-TUNNEL': 'tunnels.html',
                                'MOD-DNA': 'dna-request.html',
                                'MOD-TRACE': 'missing.html'
                            };
                            const moduleIdToTranslationKey = {
                                'MOD-AGENCIES': 'navAgencies',
                                'MOD-ASSIST': 'navAssistance',
                                'MOD-TRACK': 'navTrack',
                                'MOD-DNA': 'navDNA',
                                'MOD-TRACE': 'navMissing',
                                'MOD-GUIDES': 'navGuides',
                                'MOD-PARTNERS': 'navPartner',
                                'MOD-RUMOUR': 'navRumour',
                                'MOD-SAFE': 'navSafe',
                                'MOD-INFO': 'navInfo',
                                'MOD-DAMAGE': 'navDamage',
                                'MOD-RELIEF': 'navRelief',
                                'MOD-WATER-PT': 'navWater',
                                'MOD-SHELTER': 'navShelter',
                                'MOD-TUNNEL': 'navTunnel',
                                'MOD-WATER-LVL': 'navWaterLvl'
                            };

                            currentEventData.modules.forEach(mod => {
                                if (mod.hasPublicPage && mod.navPath) {
                                    const filename = localFileMap[mod.moduleId] || (mod.navPath.startsWith('/') ? mod.navPath.substring(1) + '.html' : mod.navPath + '.html');
                                    const translatedLabel = t(moduleIdToTranslationKey[mod.moduleId]) || mod.navLabel;
                                    navHtml += `<li><a href="${base}${filename}${eventParam}">${translatedLabel}</a></li>`;
                                }
                            });
                            navHtml += `<li><a href="${base}for-authorities.html${eventParam}">${t('navAuthorities')}</a></li>`;
                            navList.innerHTML = navHtml;
                            
                            // Re-apply active state
                            const currentPath = location.pathname;
                            const filename = currentPath.split('/').pop() || 'index.html';
                            const isGuidesSubdir = location.pathname.includes('/guides/');
                            navList.querySelectorAll('a').forEach(link => {
                                const linkHref = link.getAttribute('href');
                                if (linkHref) {
                                    const linkPath = linkHref.split('?')[0];
                                    const linkFilename = linkPath.split('/').pop();
                                    if (filename === linkFilename) {
                                        link.classList.add('active');
                                    } else if (isGuidesSubdir && linkFilename === 'guides.html') {
                                        link.classList.add('active');
                                    }
                                }
                            });
                        }
                    }
                }
            } else {
                eventSwitcher.innerHTML = `<option value="${currentEventId}">${currentEventId}</option>`;
                updateLanguageDropdown();
            }
        }).catch(err => {
            console.error('Failed to load active events', err);
            eventSwitcher.innerHTML = `<option value="${currentEventId}">${currentEventId}</option>`;
            updateLanguageDropdown();
        });
        
        eventSwitcher.addEventListener('change', (e) => {
            const newEventId = e.target.value;
            localStorage.setItem('fc_current_event_id', newEventId);
            
            const url = new URL(window.location.href);
            url.searchParams.set('event', newEventId);
            window.location.href = url.toString();
        });
    } else {
        eventSwitcher.innerHTML = `<option value="${currentEventId}">${currentEventId}</option>`;
        updateLanguageDropdown();
    }

    // Language switcher
    header.querySelector('#lang-switcher').addEventListener('change', (e) => {
        setLang(e.target.value);
        // Reload page to apply language selection
        window.location.reload();
    });

    // Highlight the active nav link — green bottom border, matching the live site
    const currentPath = location.pathname;
    const filename = currentPath.split('/').pop() || 'index.html';
    const isGuidesSubdir = location.pathname.includes('/guides/');

    header.querySelectorAll('.site-nav-list a').forEach(a => {
        let target = a.getAttribute('href');
        if (target) {
            target = target.split('?')[0];
            if (target.startsWith('/')) target = target.substring(1);
            if (target === filename || (filename === '' && target === 'index.html') || (isGuidesSubdir && target === 'guides.html')) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
            }
        }
    });
    
    applyStaticI18n();
}

function applyStaticI18n() {
    const lang = getLang();

    // 1. Scan elements with data-i18n="key"
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.type === 'button' || el.type === 'submit') {
                    el.value = translated;
                } else {
                    el.placeholder = translated;
                }
            } else {
                el.textContent = translated;
            }
        }
    });

    // 2. Localize triage action cards on home page
    const safeCard = document.querySelector('.card-action.success');
    if (safeCard) {
        const h3 = safeCard.querySelector('h3');
        const p = safeCard.querySelector('p');
        const btn = safeCard.querySelector('a.btn');
        if (h3) h3.textContent = t('iAmSafeTitle');
        if (p) p.textContent = t('iAmSafeDesc');
        if (btn) btn.textContent = t('iAmSafeBtn');
    }

    const dangerCard = document.querySelector('.card-action.danger');
    if (dangerCard) {
        const h3 = dangerCard.querySelector('h3');
        const p = dangerCard.querySelector('p');
        const btn = dangerCard.querySelector('a.btn');
        if (h3) h3.textContent = t('reportMissingTitle');
        if (p) p.textContent = t('reportMissingDesc');
        if (btn) btn.textContent = t('reportMissingBtn');
    }

    const cards = document.querySelectorAll('.card-action');
    if (cards.length >= 3) {
        const trackCard = cards[2];
        const h3 = trackCard.querySelector('h3');
        const p = trackCard.querySelector('p');
        const btn = trackCard.querySelector('a.btn');
        if (h3) h3.textContent = t('trackCaseTitle');
        if (p) p.textContent = t('trackCaseDesc');
        if (btn) btn.textContent = t('trackCaseBtn');
    }

    // 3. Localize safe.html form if present
    const safeForm = document.getElementById('safety-form');
    if (safeForm) {


        const sBtn = document.getElementById('submit-btn');
        if (sBtn) sBtn.textContent = t('submitSafeBtn');

        const aside = document.querySelector('.safe-panel--warn');
        if (aside) {
            const pTitle = aside.querySelector('.safe-panel-title');
            if (pTitle) pTitle.textContent = t('beforeSubmit');
            const items = aside.querySelectorAll('li');
            if (items.length >= 3) {
                items[0].textContent = t('rule1');
                items[1].textContent = t('rule2');
                items[2].textContent = t('rule3');
            }
        }
    }
}

// Global exports
window.FC_STRINGS = FC_STRINGS;
window.getLang = getLang;
window.setLang = setLang;
window.t = t;
window.applyStaticI18n = applyStaticI18n;

function showNotice(container, message, type = 'info') {
    const el = document.createElement('div');
    el.className = `notice notice-${type}`;
    el.textContent = message;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    container.prepend(el);
    return el;
}

function clearNotices(container) {
    container.querySelectorAll('.notice').forEach((n) => n.remove());
}

function formatDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString(undefined, {
            dateStyle: 'medium', timeStyle: 'short',
        });
    } catch (e) {
        return iso;
    }
}

// Add sr-only class for screen-reader-only labels
const srStyle = document.createElement('style');
srStyle.textContent = '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}';
document.head.appendChild(srStyle);

document.addEventListener('DOMContentLoaded', renderChrome);
