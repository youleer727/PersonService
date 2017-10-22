var express = require('express');
var http = require('http');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.raw());
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: false}));
var AWS = require("aws-sdk");
AWS.config.update({region: "us-east-1"});
var baseURL = process.env.BASE_URL;
var addressURL = process.env.ADDRESS_URL;
const querySet = {"first_name":true,"last_name":true,"address_id":true, "startKey_id":true, "limit":true};

function addHateoas(item){
	item["links"] = [
		{"rel":"self", "href":baseURL+'/'+item.person_id},
		{"rel":"address", "href":baseURL+'/'+item.person_id+"/address"}
	];
}
function processQuery(query, params){
	if(query.startKey_id!== undefined){
		params['ExclusiveStartKey'] = {person_id:query.startKey_id};
		delete query["startKey_id"]; 
	}
	if(query.limit!== undefined){
		params['Limit'] = query.limit;
		delete query["limit"];
	}

	Object.keys(query).forEach(function(key) {
		if(querySet[key]!==true){
			delete query[key]; 
		}
		else{
			if(params['FilterExpression']===undefined)  params['FilterExpression'] = "";
			else params['FilterExpression']+=" AND ";
			params['FilterExpression']+= key+"=:"+key;
			if(params['ExpressionAttributeValues']===undefined) params['ExpressionAttributeValues'] ={};
			params['ExpressionAttributeValues'][':'+key] = query[key];			
		}
	});	
	console.log(params);
}
router.get('/person', function(req, res) {
	let ddb = new AWS.DynamoDB.DocumentClient();
	let params = {
        TableName: "PersonTable",
        Limit: 20
    };
	processQuery(req.query, params);
 

	if(req.query.startKey_id!== undefined){
		params['ExclusiveStartKey'] = {person_id:req.query.startKey_id};
	}

	ddb.scan(params, function(err, data) {
   		if (err) console.log(err, err.stack); // an error occurred
        else {
            // adding HATEOAS format
	    	for(let i=0; i<data.Items.length; i++){
	    		addHateoas(data.Items[i]);	
	    	}
		    if(data.LastEvaluatedKey!==undefined){
		    	q = req.originalUrl.split("?")[1]===undefined? "":req.originalUrl.split("?")[1]+"&";
		    	data["links"] = [
					{"rel":"next", "href":baseURL+"?"+q+"startKey_id="+data.LastEvaluatedKey.person_id}
		    	]
		    }
	    	res.send(data);
	    	res.end();
	    }
	});	    
});

router.post('/person', function(req, res) {
	console.log(req.body);
	let ddb = new AWS.DynamoDB.DocumentClient();
	let add_id = req.body.person_id;
	let params = {
		TableName : 'PersonTable',
		Item: req.body,
		'ConditionExpression':'attribute_not_exists(person_id)',
	};
	ddb.put(params, function(err, data) {
		if (err) {
			res.status(400);
			res.send("Person Existed");
			console.log(err);
			res.end();
		}
		else {
			res.status(202);
			res.end();
		}
	});
});

router.get('/person/:p_id/', function(req, res) {
	let ddb = new AWS.DynamoDB.DocumentClient();
    let p_id = req.params.p_id;
	let params = {
	    TableName:'PersonTable',
	    Key:{
	      person_id: p_id
	    }
	};
	ddb.get(params, function(err, data){
	    if (err || isNaN(p_id)) {
	    	console.log(err, err.stack); // an error occurred
	    	res.status(400);
	    	res.end("400 Bad Request or the id should be a number");
	    }
	    else {
	    	if(data.length!=0){
	    		addHateoas(data.Item);	    		
	    	}
	    	res.status(200).send(data);
	    	res.end();
	    }
	});
});


router.put('/person/:p_id/', function(req, res) {
	let ddb = new AWS.DynamoDB.DocumentClient();
    let p_id = req.params.p_id;
    var params = {
        TableName: 'PersonTable',
        Key:{
            person_id : p_id
        },
        UpdateExpression: "set first_name =:firstname, last_name =:lastname, address_id =:address_id",
        ExpressionAttributeValues:{
            ":firstname" : req.body.first_name,
            ":lastname" : req.body.last_name,
            ":address_id" : req.body.address_id
        }
    };
	ddb.update(params, function(err, data) {
	    if (err) {
	        console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
	    	res.status(400);
	    	res.end("The person_id: "+p_id+" is not in the database.");
	    }
	    else {
	        console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
			res.status(202);
	        res.end("The person_id: "+p_id+" has been updated.");
	    }
	});

});

router.delete('/person/:p_id/', function(req, res) {
	let ddb = new AWS.DynamoDB.DocumentClient();
    let p_id = req.params.p_id;
	let params = {
	    TableName : 'PersonTable',
	    Key: {
	      person_id: p_id,
	    }
	};

	ddb.delete(params, function(err, data) {
	    if (err || isNaN(p_id)) {
	    	console.log(err);
	    	res.status(400);
	    	res.end("400 Bad Request or the person_id should be number");
	    }
	    else {
	    	res.status(202);
	    	res.end()
	    }
	});
});


router.get('/person/:p_id/address', function (req, res) {
	let ddb = new AWS.DynamoDB.DocumentClient();
    var p_id = req.params.p_id;
	let params = {
	    TableName : 'PersonTable',
	    Key: {
	      person_id: p_id,
	    }
	};
    ddb.get(params, function(err, data) {
        if (err) {
            console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
            res.status(400);
            res.end("400 Bad Request or the person_id should be number");
        } 
        else {
        	res.status(200).send(addressURL+"/"+data.Item.address_id);
        	res.end();
        }
    });

});

module.exports = router;
