const Address = require('../../model/addressSchema')
const User = require('../../model/userSchema')
const { search } = require('../../routes/userRoutes')

const customerInfo = async(req, res)=>{
    try {

        const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest'
        let search = req.query.search || ""
        let page = parseInt(req.query.page) || 1
        const limit = 4
        let skip = (page-1)*limit

        const userData = await User.find({
            isAdmin:false,
            $or:[
                {fullname:{$regex:".*"+search+".*", $options:"i"}},
                {email:{$regex:".*"+search+".*", $options:"i"}}
            ]
        })
        .sort({createdOn:-1})
        .limit(limit)
        .skip(skip)
        .exec()

        const userIds = userData.map(data=>data._id)

        const address = await Address.find({userId:{$in:userIds}, "address.isDefault": true},{userId:1, "address.$": 1})

         const addressMap = {};
    address.forEach(addr => {
        addressMap[addr.userId.toString()] = addr.address[0]; 
    })

     const userDataWithAddresses = userData.map(user => {
        return {
            ...user._doc,
            defaultAddress: addressMap[user._id.toString()] || null
        };
    })

        const count = await User.find({
            isAdmin:false,
            $or:[
                {fullname:{$regex:".*"+search+".*"}},
                {email:{$regex:".*"+search+".*"}}
            ]
        })
        .countDocuments()

        const templateData = {
            data: userDataWithAddresses,
            totalPages: Math.ceil(count/limit),
            currentPage: page,
            search: search
        }

        if(isAjax){
       return res.render('admin/customers', templateData, (err, html)=>{
            if(err) return res.status(500).send('Error rendering users')
                res.send(html)
        })
    }

    res.render('admin/customers', templateData)

    } catch (error) {
        console.error("error in loding customer info: "+error)
    }
}

const blockUser = async(req,res)=>{

    try {
        let id = req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:true}})
        res.redirect('/admin/users')
    } catch (error) {
        console.error("Error in block customer "+error)
    }


}


const unblockUser = async (req,res)=>{
    try {

        let id = req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect('/admin/users')
        
    } catch (error) {
        console.error("Error in unblock customer: "+error)
        
    }
}




module.exports = {
    customerInfo,
    blockUser,
    unblockUser,
    
}