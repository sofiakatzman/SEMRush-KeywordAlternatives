// config
const SEMRUSH_API_KEY = "a64db1a0f844a43e84e6eaf430d835c3";
const SEMRUSH_API_URL = "https://api.semrush.com/";

// fetch the latest added record from the 'Keywords' table
let table = base.getTable("Keywords");
// get all at records
let query = await table.selectRecordsAsync({
  fields: ["Keyword", "Status", "Blog Posts", "Keyword Level"],
});

// find the ones with pending processing status
let recordsToProcess = query.records.filter(
  (record) => record.getCellValue("Status")?.name === "Pending Processing"
);

// error logging for no found records
if (recordsToProcess.length === 0) {
  console.log('No records with status "pending processing" found.');
}

// loop through records that need to be processed
for (let record of recordsToProcess) {
  let keyword = record.getCellValue("Keyword");
  let blogPost = record.getCellValue("Blog Posts");
  let recordId = record.id;

  // Error logging for missing keywords
  if (!keyword) {
    console.log("No keyword found in the new record.");
  }

  // Construct the SEMrush API request URL
  let url = `${SEMRUSH_API_URL}?type=phrase_related&key=${encodeURIComponent(
    SEMRUSH_API_KEY
  )}&phrase=${encodeURIComponent(
    keyword
  )}&export_columns=Ph,Nq,Cp,Co,Nr,Td,Rr,Fk&database=us&display_limit=10&display_sort=nq_desc&display_filter=%2B|Nq|Lt|1000`;

  try {
    output.text(`Fetching data from URL: ${url}`);

    // Use remoteFetchAsync to make the request
    let response = await remoteFetchAsync(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok)
      throw new Error(
        `HTTP error! Status: ${response.status} - ${response.statusText}`
      ); // error handling for response - further action TK

    let data = await response.text(); // SEMrush API returns data as text

    let lines = data.split("\n"); // Split text by lines
    let headers = lines[0].split(";"); // Get headers
    let rows = lines.slice(1); // Get data rows

    // Get indices of the columns we need
    let keywordIndex = headers.indexOf("Keyword");
    let volumeIndex = headers.indexOf("Search Volume");
    let cpcIndex = headers.indexOf("CPC");

    // edit original record when no results are found
    if (keywordIndex === -1 || volumeIndex === -1 || cpcIndex === -1) {
      output.text("Error: Expected columns not found in response.");
      await table.updateRecordAsync(recordId, {
        "Keyword Volume": 0,
        "Keyword CPC": 0,
        Status: { id: "selGPLzxnmZ5gd9hl" }, // keyword error status
      });
    } else {
      // Create new records from SEMRush Data
      for (let row of rows) {
        if (row.trim()) {
          let columns = row.split(";");
          let keyword = columns[keywordIndex];
          let volume = parseInt(columns[volumeIndex]);
          let cpc = parseInt(columns[cpcIndex]);

          // Create a new record in AirTable
          await table.createRecordAsync({
            "Blog Posts": blogPost,
            Keyword: keyword,
            "Keyword Volume": volume,
            "Keyword CPC": cpc,
            Status: { name: "Ready To Review" },
            "Keyword Level": { name: "Secondary" },
          });
        }
      }
      output.text("Records created successfully.");
      // fetch for keyword data

      // Construct the SEMrush API request URL
      let urlseed = `${SEMRUSH_API_URL}?type=phrase_this&key=${encodeURIComponent(
        SEMRUSH_API_KEY
      )}&phrase=${encodeURIComponent(
        keyword
      )}&export_columns=Ph,Nq,Cp,Co,Nr,Td&database=us`;

      try {
        output.text(`Fetching data from URL: ${urlseed}`);

        // Use remoteFetchAsync to make the request
        let response = await remoteFetchAsync(urlseed, {
          method: "GET",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        if (!response.ok)
          throw new Error(
            `HTTP error! Status: ${response.status} - ${response.statusText}`
          );

        let data = await response.text(); // SEMrush API returns data as text
        console.log(data);

        // Split text by lines
        let seedLines = data.split("\n");

        // Get headers and data rows
        let seedHeaders = seedLines[0].split(";");
        let seedRows = seedLines.slice(1);

        // Get indices of the columns we need
        let seedVolumeIndex = seedHeaders.indexOf("Search Volume");
        let seedCpcIndex = seedHeaders.indexOf("CPC");

        // Check if expected columns are found
        if (seedVolumeIndex === -1 || seedCpcIndex === -1) {
          output.text("Error: Expected columns not found in seed response.");
        } else {
          // Extract data from the first row (assuming it has the relevant data)
          let seedColumns = seedRows[0].split(";");
          let seedVolume = parseInt(seedColumns[seedVolumeIndex]);
          let seedCpc = parseFloat(seedColumns[seedCpcIndex]);

          // Update original record and change status to ready to review
          await table.updateRecordAsync(recordId, {
            "Keyword Volume": seedVolume,
            "Keyword CPC": seedCpc,
            Status: { id: "sels5yDurIsoRiO6n" }, // keyword ready to review status
          });

          output.text(
            "Original record updated successfully with keyword volume and CPC."
          );
        }
      } catch (error) {
        output.text(
          `Error fetching data from SEMrush for keyword: ${error.message}`
        );
        // update original record and change status to ready to review
        // tag keyword as keyword error
        await table.updateRecordAsync(recordId, {
          "Keyword Volume": 0,
          "Keyword CPC": 0,
          Status: { id: "selGPLzxnmZ5gd9hl" },
        });
      }
    }
  } catch (error) {
    output.text(`Error fetching data from SEMrush: ${error.message}`);
  }
}
