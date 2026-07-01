// Local name-gender dictionary — zero API dependency.
//
// Curated for the accounts we actually analyze: heavy Indian + Western first
// names, a set of well-known ambiguous names that we deliberately refuse to
// classify. Extend as we see missing names in the "unknown" bucket during
// real scans — this file is meant to grow with usage.
//
// Confidence model:
//   - name in MALE set   → { gender: "male",   probability: 0.95 }
//   - name in FEMALE set → { gender: "female", probability: 0.95 }
//   - name in AMBIGUOUS  → { gender: null,     probability: 0    }
//   - anything else      → null (unknown, excluded from split)

export interface NameGenderResult {
  gender: "male" | "female" | null;
  probability: number;
}

// prettier-ignore
const MALE_NAMES = new Set<string>([
  // Indian male
  "aarav","aarush","aayan","aayush","abhay","abhinav","abhishek","aditya","advait","advik","ajay","ajit","akash","akshay","alok","amar","amit","amitabh","anand","aneesh","aniket","anil","ankit","ankur","ankush","anmol","anshul","anup","anurag","arjun","arnav","arpit","arun","arvind","aryan","ashish","ashok","atul","ayaan","balaji","bharat","bhavesh","bhavya","bhupendra","chandan","chetan","chirag","daksh","darshan","dev","devansh","devendra","dhruv","dilip","dinesh","divyansh","faiz","farhan","gagan","ganesh","gaurav","girish","gopal","govind","hardik","harish","harsh","harshit","hemant","hitesh","hrithik","imran","ishaan","ishan","jai","jatin","jay","kabir","kailash","kapil","karan","kartik","karthik","kashyap","keshav","krish","krishna","kunal","lakshay","lalit","lucky","madhav","mahesh","manas","manav","manish","manoj","milan","mohan","mohit","mridul","mukesh","mukul","naman","narayan","naveen","navin","neel","neeraj","nikhil","nikunj","nilesh","nishant","nithin","nitin","om","paras","parth","pavan","piyush","prabhat","pradeep","prakash","pranav","praneeth","pratham","pratik","praveen","prayag","prem","priyansh","priyanshu","pulkit","punit","puneet","purushottam","radhesh","raghav","raghavan","raghu","rahul","raj","rajat","rajeev","rajesh","rajiv","rakesh","ram","raman","ramesh","ranveer","ratan","ravi","rishab","rishabh","rishi","ritesh","ritik","rohan","rohit","ronit","rudra","sachin","sagar","sahil","sai","saket","sameer","samir","sandeep","sanjay","sanket","santosh","sarthak","satish","satyam","saurabh","shailendra","shashank","shaurya","shivam","shivansh","shrey","shreyansh","shreyas","shubham","shyam","siddharth","siddhesh","sohail","sohan","sourav","subhash","sudhir","sudipto","sujay","sumit","sundar","sunil","suraj","suresh","surya","tanish","tanmay","tarun","tejas","tushar","udit","uday","umesh","utkarsh","uttam","vaibhav","vansh","varun","vasu","vedant","vibhav","vibhor","vijay","vikas","vikram","vinay","vineet","vinit","vinod","vipul","viraj","virat","vishal","vivaan","vivek","yash","yogesh","yuvraj","zaid","zayn",
  // Western male
  "aaron","abraham","adam","adrian","aidan","alan","albert","alec","alex","alexander","alfred","allen","andrew","andy","angus","anthony","antonio","archie","arthur","austin","barry","ben","benjamin","bernard","bill","billy","blake","bob","bobby","brad","bradley","brandon","brendan","brent","brett","brian","bruce","bryan","cameron","carl","carlos","charles","charlie","chase","chris","christian","christopher","clark","claude","clay","clayton","cody","colin","connor","craig","curtis","dale","dan","daniel","danny","darren","dave","david","dean","dennis","derek","dominic","don","donald","douglas","dustin","dylan","earl","ed","edgar","edmund","eduardo","edward","edwin","elijah","elliot","emmanuel","enrique","eric","ernest","ethan","eugene","evan","felix","fernando","francis","francisco","frank","fred","frederick","gabriel","gary","gavin","george","gerald","gilbert","glenn","gordon","graham","grant","greg","gregory","harold","harrison","harry","harvey","hector","henry","howard","hunter","ian","isaac","ivan","jack","jackson","jacob","jake","james","jamie","jared","jason","javier","jay","jeff","jeffrey","jeremy","jerry","jesse","jim","jimmy","joe","joel","john","johnny","jonathan","jordan","jorge","jose","joseph","josh","joshua","juan","julian","julio","justin","karl","keith","ken","kenneth","kevin","kyle","lance","larry","lawrence","lee","leo","leon","leonard","leroy","lewis","logan","louis","lucas","luis","luke","malcolm","marc","marco","marcus","mario","mark","martin","matt","matthew","maurice","max","maxwell","michael","miguel","mike","mitchell","morris","nathan","neal","neil","nelson","nicholas","nick","noah","norman","oliver","oscar","otis","owen","pablo","patrick","paul","peter","phil","philip","phillip","preston","quinn","ralph","randall","randy","ray","raymond","reed","reginald","reid","rene","rex","ricardo","richard","rick","ricky","riley","robert","roberto","rodney","roger","roland","ron","ronald","ronnie","rory","ross","roy","russell","ryan","salvador","sam","samuel","scott","sean","sebastian","seth","shane","shaun","shawn","sidney","simon","spencer","stanley","stephen","steve","steven","stewart","stuart","ted","terry","theodore","thomas","tim","timothy","tobias","todd","tom","tommy","tony","travis","trent","trevor","troy","tyler","victor","vincent","wade","wallace","walter","warren","wayne","wesley","william","willie","xavier","zachary","zack",
]);

// prettier-ignore
const FEMALE_NAMES = new Set<string>([
  // Indian female
  "aadhya","aaliya","aanya","aarohi","aarushi","aastha","aditi","advika","aisha","aishwarya","akansha","akshara","alia","alisha","alka","ambika","amrita","ana","anaya","angel","anika","anisha","anita","anjali","ankita","antara","anushka","anvi","aparna","apeksha","aradhya","archana","aria","arpita","arya","asha","ashwini","avani","avantika","ayesha","ayushi","bhagya","bhairavi","bhavana","bhavna","bhumi","charu","chhavi","chitra","daisy","damini","darshana","deepa","deepali","deepika","devika","dhara","dhriti","diksha","divya","drashti","ekta","esha","falak","falguni","farah","farida","gauri","geeta","geetanjali","geetha","gouri","gunjan","hansika","harini","harpreet","harshita","hasita","hema","hetal","hina","ila","indira","ira","isha","ishika","ishita","jaanvi","jagriti","janhavi","janvi","jasmin","jasmine","jaya","jhanvi","jiya","juhi","kajal","kamini","kanchan","kangana","kanika","kareena","karishma","kashvi","kavita","kavya","khushi","komal","kranti","krishna","krithika","kriti","kritika","kruti","kumkum","kusum","lakshmi","lalita","latha","leela","lipika","madhavi","madhu","madhuri","mahek","maithili","malini","mamta","mansi","manvi","manya","mayuri","medha","meena","meenal","meera","megha","mehak","meher","mira","mishika","mitali","mohini","monika","muskan","myra","nabhya","nainika","nandini","navya","neelam","neetu","neha","niharika","nikita","nirali","nisha","nishtha","nita","nithya","nitya","niyati","padma","pallavi","payal","pihu","pooja","poonam","prabha","prachi","pragati","pragya","prajakta","pranjal","preeti","prerna","priya","priyanka","purnima","purvi","pushpa","rachana","radha","radhika","raghavi","rakhi","ramya","rani","rashmi","reena","reet","reeti","rekha","renu","rhea","richa","riddhi","rima","rimjhim","rina","rinky","rita","ritika","ritu","riya","roshni","roshini","rupa","rupali","sadhana","saheli","sakshi","samaira","samiksha","sana","sandhya","sangeeta","sangita","sanjana","sanya","saraswati","saumya","savita","sayali","seema","shagun","shakti","shakuntala","shalini","shalu","shanaya","shanti","sharanya","sharmila","shefali","shikha","shilpa","shivali","shivani","shobha","shraddha","shreya","shrishti","shristi","shruti","shubhi","shweta","simran","sita","smita","smriti","sneha","soha","sona","sonam","sonia","sonu","soumya","srishti","srushti","stuti","suchi","suchita","sudha","sujata","sujatha","sukanya","suman","sumati","sumitra","sunita","suparna","supriya","surbhi","sushma","swara","swati","tamanna","tanisha","tanushree","tanvi","tanya","tara","tejal","tejaswini","trisha","tripti","tulsi","uma","urmila","urvashi","usha","vaidehi","vaishali","vaishnavi","vandana","vanita","varsha","vasudha","veena","vibha","vidhi","vidya","vijaya","vimala","vineeta","vrinda","yamini","yashika","yashoda","yogita","zara","zoya",
  // Western female
  "abigail","ada","adrienne","agnes","aimee","alexandra","alexis","alice","alicia","alison","allison","alyssa","amanda","amber","amelia","amy","andrea","angela","angelica","angelina","anita","ann","anna","anne","annette","annie","april","ariana","arlene","ashley","audrey","autumn","ava","barbara","beatrice","becky","belinda","bernice","beth","bethany","betty","beverly","bianca","bonnie","brenda","brianna","bridget","brittany","brooke","camila","camille","candice","carla","carly","carmen","carol","caroline","carolyn","catherine","cathy","cecilia","celeste","chandra","charlene","charlotte","chelsea","cheryl","chloe","christina","christine","christy","cindy","claire","clara","claudia","colleen","connie","constance","corinne","courtney","cristina","crystal","cynthia","dana","danielle","daphne","dawn","deanna","debbie","deborah","debra","delilah","denise","destiny","diana","diane","dolores","donna","dora","doris","dorothy","edith","edna","eileen","elaine","eleanor","elena","elise","elizabeth","ella","ellen","emilia","emily","emma","erica","erika","erin","estelle","esther","eva","eve","evelyn","faith","fiona","florence","frances","gabriela","gabrielle","gail","gemma","genevieve","georgia","geraldine","gillian","gina","gladys","glenda","gloria","grace","gwen","gwendolyn","hannah","harper","hazel","heather","heidi","helen","helena","hilary","holly","hope","ida","ingrid","irene","iris","isabel","isabella","isabelle","jackie","jacqueline","jade","jamie","jan","jane","janet","janice","janine","jasmine","jean","jeanette","jeanne","jenna","jennifer","jenny","jessica","jill","jillian","joan","joanna","joanne","jocelyn","jodi","joyce","judith","judy","julia","juliana","julie","june","kaitlyn","kara","karen","karla","kate","katherine","kathleen","kathryn","kathy","katie","kayla","kelly","kelsey","kendra","kerry","kimberly","krista","kristen","kristin","kristina","kristy","krystal","lacey","larissa","laura","laurel","lauren","laurie","layla","leah","leanne","leigh","leslie","lila","lily","linda","lindsay","lindsey","lisa","liz","lois","lola","loretta","lori","louise","lucia","lucy","luna","lydia","lynn","lynne","mackenzie","maddison","madeline","madison","maggie","mandy","marcia","margaret","margarita","marian","marianne","maribel","marie","marilyn","marina","marion","marisa","marissa","marjorie","marlene","martha","mary","maureen","maya","meagan","megan","meghan","melanie","melinda","melissa","meredith","mia","michele","michelle","mildred","millie","mindy","miranda","miriam","molly","monica","monique","morgan","muriel","nadia","nancy","naomi","natalie","natasha","nellie","nicole","nikki","nina","nora","norma","olivia","opal","pam","pamela","paola","patricia","patsy","patty","paula","pauline","pearl","peggy","penelope","penny","phyllis","polly","priscilla","rachael","rachel","rebecca","regina","renee","rhonda","rita","roberta","robin","rochelle","rosa","rose","rosemary","roxanne","ruby","ruth","sabrina","sally","samantha","sandra","sandy","sara","sarah","sasha","savannah","selena","serena","shannon","sharon","sheila","shelby","sheri","sherri","sherry","shirley","sierra","sofia","sonia","sonya","sophia","sophie","stacey","stacy","stella","stephanie","summer","susan","susana","susie","suzanne","sylvia","tamara","tammy","tara","teresa","terri","theresa","tiffany","tina","toni","tonya","tracey","tracy","trisha","valeria","valerie","vanessa","vera","veronica","vickie","victoria","violet","virginia","vivian","wanda","wendy","whitney","willa","willow","wilma","winifred","yolanda","yvette","yvonne","zoe","zoey",
]);

// Names deliberately refused as too ambiguous to call. Better to return null
// than guess wrong on names split ~50/50 across genders.
const AMBIGUOUS_NAMES = new Set<string>([
  "alex","alexis","angel","ariel","ash","ashton","aubrey","avery","bailey","blair","blake","brooklyn","cameron","carey","carroll","casey","charlie","chris","corey","dakota","dana","devon","drew","dylan","elliot","emerson","emery","evan","finley","harley","hayden","hunter","jaime","jamie","jesse","jordan","jules","justice","kai","kelly","kendall","kim","kiran","lee","leslie","lynn","mackenzie","madison","marion","max","morgan","noel","parker","pat","peyton","phoenix","piper","quinn","reese","reign","remy","riley","river","robin","rowan","sage","sam","sasha","shannon","shea","skylar","skyler","stevie","sydney","taylor","terry","tracy","tyler","val","whitney",
]);

export function classifyName(rawName: string): NameGenderResult | null {
  const key = rawName.trim().toLowerCase();
  if (!key || key.length < 2) return null;
  if (AMBIGUOUS_NAMES.has(key)) return { gender: null, probability: 0 };
  if (MALE_NAMES.has(key)) return { gender: "male", probability: 0.95 };
  if (FEMALE_NAMES.has(key)) return { gender: "female", probability: 0.95 };
  return null;
}

export interface ClassifiedName {
  name: string;
  gender: "male" | "female" | null;
  probability: number;
}

export function classifyNamesLocal(
  firstNames: string[],
): {
  aggregate: { male: number; female: number; unknown: number };
  classified: ClassifiedName[];
  totalRequested: number;
} {
  let male = 0;
  let female = 0;
  let unknown = 0;
  const perNameCounts = new Map<string, number>();

  for (const raw of firstNames) {
    const key = raw.toLowerCase();
    perNameCounts.set(key, (perNameCounts.get(key) ?? 0) + 1);
    const result = classifyName(raw);
    if (!result || result.gender === null) {
      unknown++;
    } else if (result.gender === "male") {
      male++;
    } else {
      female++;
    }
  }

  // For the per-name detail list (what the view shows as chips), collapse to
  // unique names so we don't show "Priya" 6 times.
  const seen = new Set<string>();
  const classified: ClassifiedName[] = [];
  for (const raw of firstNames) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const result = classifyName(raw);
    if (!result) continue; // skip fully-unknown from the chips
    classified.push({
      name: raw,
      gender: result.gender,
      probability: result.probability,
    });
  }
  // Sort female first, then male, then ambiguous (null) — matches the split-bar order.
  classified.sort((a, b) => {
    const rank = (g: "male" | "female" | null) => (g === "female" ? 0 : g === "male" ? 1 : 2);
    return rank(a.gender) - rank(b.gender);
  });

  return {
    aggregate: { male, female, unknown },
    classified,
    totalRequested: firstNames.length,
  };
}

// Extracts a plausible first name from a display name. Strips emoji + symbols,
// keeps only the first alphabetic word so "Rahul Kumar 🇮🇳" → "Rahul",
// "😎Priya😎" → "Priya". Also handles common username separators like dots
// and underscores when we fall back to parsing the username.
export function extractFirstName(displayName: string | undefined | null): string | null {
  if (!displayName) return null;
  const cleaned = displayName
    .replace(/[^\p{L}\s\-'.]/gu, " ")
    .trim();
  if (!cleaned) return null;
  const first = cleaned.split(/[\s.\-']+/).filter(Boolean)[0];
  if (!first || first.length < 2) return null;
  if (/^\d+$/.test(first)) return null;
  return first;
}
