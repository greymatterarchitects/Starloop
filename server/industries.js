// The star roster per film industry. Each entry is [display name, English Wikipedia title, optional news query].
// Everything shown about these people (photos, bios, roles, trend scores, news, rankings) is fetched live.
// wdLang = Wikidata item for the film language (used to pull current & upcoming movies).

export const INDUSTRIES = {
  tollywood: {
    label: 'Tollywood', lang: 'te', language: 'Telugu', wdLang: 'Q8097',
    stars: [
      ['Prabhas', 'Prabhas', 'Prabhas actor'],
      ['Allu Arjun', 'Allu_Arjun'],
      ['Ram Charan', 'Ram_Charan'],
      ['Jr. NTR', 'N._T._Rama_Rao_Jr.', 'Jr NTR'],
      ['Mahesh Babu', 'Mahesh_Babu'],
      ['Samantha', 'Samantha_Ruth_Prabhu', 'Samantha Ruth Prabhu'],
      ['Rashmika', 'Rashmika_Mandanna', 'Rashmika Mandanna'],
      ['Sreeleela', 'Sreeleela'],
      ['Chiranjeevi', 'Chiranjeevi'],
      ['Pawan Kalyan', 'Pawan_Kalyan'],
      ['Vijay Deverakonda', 'Vijay_Deverakonda'],
      ['Nani', 'Nani_(actor)', 'Nani Telugu actor'],
      ['Pooja Hegde', 'Pooja_Hegde'],
    ],
  },
  hollywood: {
    label: 'Hollywood', lang: 'hi', language: 'English', wdLang: 'Q1860', wdCountry: 'Q30',
    stars: [
      ['Zendaya', 'Zendaya'],
      ['Timothée Chalamet', 'Timothée_Chalamet'],
      ['Tom Cruise', 'Tom_Cruise'],
      ['Margot Robbie', 'Margot_Robbie'],
      ['Leonardo DiCaprio', 'Leonardo_DiCaprio'],
      ['Scarlett Johansson', 'Scarlett_Johansson'],
      ['Ryan Gosling', 'Ryan_Gosling'],
      ['Dwayne Johnson', 'Dwayne_Johnson'],
      ['Florence Pugh', 'Florence_Pugh'],
      ['Robert Downey Jr.', 'Robert_Downey_Jr.'],
      ['Sydney Sweeney', 'Sydney_Sweeney'],
      ['Pedro Pascal', 'Pedro_Pascal'],
      ['Cillian Murphy', 'Cillian_Murphy'],
    ],
  },
  kollywood: {
    label: 'Kollywood', lang: 'ta', language: 'Tamil', wdLang: 'Q5885',
    stars: [
      ['Vijay', 'Vijay_(actor)', 'Thalapathy Vijay'],
      ['Rajinikanth', 'Rajinikanth'],
      ['Ajith Kumar', 'Ajith_Kumar', 'Ajith Kumar actor'],
      ['Suriya', 'Suriya', 'Suriya actor'],
      ['Dhanush', 'Dhanush'],
      ['Kamal Haasan', 'Kamal_Haasan'],
      ['Sivakarthikeyan', 'Sivakarthikeyan'],
      ['Nayanthara', 'Nayanthara'],
      ['Trisha', 'Trisha_Krishnan', 'Trisha Krishnan'],
      ['Vikram', 'Vikram_(actor)', 'Chiyaan Vikram'],
      ['Karthi', 'Karthi', 'Karthi actor'],
      ['Keerthy Suresh', 'Keerthy_Suresh'],
    ],
  },
  bollywood: {
    label: 'Bollywood', lang: 'hi', language: 'Hindi', wdLang: 'Q1568',
    stars: [
      ['Shah Rukh Khan', 'Shah_Rukh_Khan'],
      ['Salman Khan', 'Salman_Khan'],
      ['Aamir Khan', 'Aamir_Khan'],
      ['Ranbir Kapoor', 'Ranbir_Kapoor'],
      ['Deepika Padukone', 'Deepika_Padukone'],
      ['Alia Bhatt', 'Alia_Bhatt'],
      ['Hrithik Roshan', 'Hrithik_Roshan'],
      ['Akshay Kumar', 'Akshay_Kumar'],
      ['Ranveer Singh', 'Ranveer_Singh'],
      ['Kartik Aaryan', 'Kartik_Aaryan'],
      ['Kiara Advani', 'Kiara_Advani'],
      ['Katrina Kaif', 'Katrina_Kaif'],
    ],
  },
  sandalwood: {
    label: 'Sandalwood', lang: 'kn', language: 'Kannada', wdLang: 'Q33673',
    stars: [
      ['Yash', 'Yash_(actor)', 'Rocking Star Yash'],
      ['Sudeep', 'Sudeep', 'Kichcha Sudeep'],
      ['Rishab Shetty', 'Rishab_Shetty'],
      ['Darshan', 'Darshan_(actor)', 'Darshan Thoogudeepa'],
      ['Shiva Rajkumar', 'Shiva_Rajkumar'],
      ['Rakshit Shetty', 'Rakshit_Shetty'],
      ['Upendra', 'Upendra_(actor)', 'Upendra actor'],
      ['Rukmini Vasanth', 'Rukmini_Vasanth'],
      ['Rachita Ram', 'Rachita_Ram'],
      ['Dhananjaya', 'Dhananjaya_(actor)', 'Daali Dhananjaya'],
      ['Raj B. Shetty', 'Raj_B._Shetty'],
    ],
  },
  mollywood: {
    label: 'Mollywood', lang: 'ml', language: 'Malayalam', wdLang: 'Q36236',
    stars: [
      ['Mohanlal', 'Mohanlal'],
      ['Mammootty', 'Mammootty'],
      ['Fahadh Faasil', 'Fahadh_Faasil'],
      ['Dulquer Salmaan', 'Dulquer_Salmaan'],
      ['Prithviraj', 'Prithviraj_Sukumaran', 'Prithviraj Sukumaran'],
      ['Tovino Thomas', 'Tovino_Thomas'],
      ['Nivin Pauly', 'Nivin_Pauly'],
      ['Manju Warrier', 'Manju_Warrier'],
      ['Nazriya', 'Nazriya_Nazim', 'Nazriya Nazim'],
      ['Kalyani Priyadarshan', 'Kalyani_Priyadarshan'],
      ['Basil Joseph', 'Basil_Joseph'],
    ],
  },
};

export const INDUSTRY_IDS = Object.keys(INDUSTRIES);

// "Hot Now" clubs – each one is a live news channel per industry.
export const CLUBS = [
  { key: 'behind-the-scenes', title: 'Behind the Scenes', query: (t) => (t === 'Hollywood' ? 'Hollywood behind the scenes' : `${t} movie making video`) },
  { key: 'on-set-stories', title: 'On Set Stories', query: (t) => (t === 'Hollywood' ? 'Hollywood film set photos' : `${t} film shooting`) },
  { key: 'events-premieres', title: 'Events & Premieres', query: (t) => (t === 'Hollywood' ? 'Hollywood premiere red carpet' : `${t} movie pre-release event`) },
  { key: 'box-office-buzz', title: 'Box Office Buzz', query: (t) => `${t} movie box office collection` },
];

// Search word used for an industry's club news: the film language for Indian industries.
export const industryTag = (id) => (!id || !INDUSTRIES[id] ? 'Indian' : id === 'hollywood' ? 'Hollywood' : INDUSTRIES[id].language);
